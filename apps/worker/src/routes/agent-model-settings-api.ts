import {
  canManageAgentModel,
  clearAgentModelConfig,
  ForbiddenError,
  readAgentModelConfig,
  writeAgentModelConfig,
} from "@flaremo/domain";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  agentModelSchema,
  canEncryptAgentModelConfig,
  fetchAgentModelCatalog,
  isAgentModelComplete,
  openAgentModel,
  sealAgentModel,
} from "../agent/configuration";
import { getBrowserRequestContext, type HonoBindings } from "../context";
import { jsonError } from "../http";

export const agentModelSettingsApi = new Hono<HonoBindings>();

agentModelSettingsApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  try {
    const { user } = await getBrowserRequestContext(c);
    if (!canManageAgentModel(user))
      throw new ForbiddenError("Owner access is required.");
    return await next();
  } catch (error) {
    return jsonError(c, error);
  }
});
agentModelSettingsApi.use("*", bodyLimit({ maxSize: 8192 }));

// Secrets are write-only: masked previews are computed server-side and full
// values never leave the Worker. Base URL + model are non-secret identifiers.
function maskKey(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

agentModelSettingsApi.get("/", async (c) => {
  try {
    return await getAgentModelSettings(c);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function getAgentModelSettings(c: Context<HonoBindings>) {
  const { db } = await getBrowserRequestContext(c);
  const row = await readAgentModelConfig(db);
  let value: z.infer<typeof agentModelSchema> | null = null;
  let unreadable = false;
  if (row?.ciphertext) {
    try {
      value = await openAgentModel(
        c.env.FLAREMO_AGENT_MODEL_CONFIG_KEY,
        row.ciphertext,
      );
    } catch {
      unreadable = true;
    }
  }
  const envConfigured = Boolean(
    c.env.FLAREMO_LLM_API_URL || c.env.FLAREMO_LLM_MODEL,
  );
  // DB config is the effective source when it is complete and enabled;
  // otherwise (or while it is only partially configured) env is what routes.
  // env is always present in prod as the fallback, so it must never lock the
  // panel: the owner can always save a DB config to override it.
  const dbActive = Boolean(
    value && row?.enabled && isAgentModelComplete(value),
  );
  const source = dbActive
    ? ("database" as const)
    : envConfigured
      ? ("environment" as const)
      : ("none" as const);
  return c.json(
    {
      revision: row?.revision ?? null,
      enabled: dbActive,
      source,
      configured: dbActive || envConfigured,
      baseUrl: value?.baseUrl ?? "",
      model: value?.model ?? "",
      models: value?.models ?? [],
      provider: value?.provider ?? null,
      apiKeyPreview: maskKey(value?.apiKey ?? ""),
      canEncrypt: canEncryptAgentModelConfig(
        c.env.FLAREMO_AGENT_MODEL_CONFIG_KEY,
      ),
      unreadable,
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

const inputSchema = z
  .object({
    revision: z.string().nullable(),
    enabled: z.boolean(),
    config: agentModelSchema,
  })
  .loose();

// "获取模型列表": proxy the provider's /models with the base URL and key the
// owner is editing. A blank key means "use the stored one" (the full key never
// leaves the Worker, only a masked preview does).
const previewSchema = z
  .object({
    baseUrl: z.string().trim().min(1).max(256),
    apiKey: z.string().trim().max(2048).optional().default(""),
  })
  .loose();

agentModelSettingsApi.post("/preview-models", async (c) => {
  try {
    const parsed = previewSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json({ error: { message: "Invalid request" } }, 400);
    const { db } = await getBrowserRequestContext(c);
    let apiKey = parsed.data.apiKey;
    if (!apiKey) {
      const row = await readAgentModelConfig(db);
      if (row?.ciphertext) {
        try {
          const old = await openAgentModel(
            c.env.FLAREMO_AGENT_MODEL_CONFIG_KEY,
            row.ciphertext,
          );
          apiKey = old.apiKey;
        } catch {
          // No stored key to fall back on; run with an empty one.
        }
      }
    }
    try {
      const models = await fetchAgentModelCatalog(
        parsed.data.baseUrl,
        apiKey,
      );
      return c.json(
        {
          models,
          ok: true,
          diag:
            (fetchAgentModelCatalog as unknown as { _diag?: string[] })._diag ??
            ["no diag"],
        },
        200,
        { "Cache-Control": "no-store" },
      );
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: {
            message: error instanceof Error ? error.message : "Request failed",
          },
        },
        400,
      );
    }
  } catch (error) {
    return jsonError(c, error);
  }
});

agentModelSettingsApi.put("/", async (c) => {
  try {
    return await putAgentModelSettings(c);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function putAgentModelSettings(c: Context<HonoBindings>) {
  const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: { message: "Invalid configuration" } }, 400);
  const { db } = await getBrowserRequestContext(c);
  const row = await readAgentModelConfig(db);
  const input = parsed.data;
  if ((row?.revision ?? null) !== input.revision)
    return c.json(
      { error: { message: "Configuration changed. Reload before saving." } },
      409,
    );
  const value = input.config;
  // Keep the stored key when the client left it blank (masked preview only).
  if (row?.ciphertext) {
    try {
      const old = await openAgentModel(
        c.env.FLAREMO_AGENT_MODEL_CONFIG_KEY,
        row.ciphertext,
      );
      value.apiKey ||= old.apiKey;
    } catch {
      return c.json(
        {
          error: {
            message:
              "Stored configuration unavailable. Delete it before replacing.",
          },
        },
        409,
      );
    }
  }
  if (!isAgentModelComplete(value))
    return c.json(
      { error: { message: "Base URL and model are required" } },
      400,
    );
  // The owner expects a save to keep working end-to-end: hit the provider's
  // /models with the effective key first and refuse to persist when it is
  // unreachable or auth fails. A gateway with no /models (returns []) is
  // still accepted.
  try {
    await fetchAgentModelCatalog(value.baseUrl, value.apiKey);
  } catch {
    return c.json(
      {
        error: {
          message:
            "无法连接模型服务商，请检查 API Base URL 和 API Key 后重试。",
        },
      },
      400,
    );
  }
  const ciphertext = await sealAgentModel(
    c.env.FLAREMO_AGENT_MODEL_CONFIG_KEY,
    value,
  );
  const result = await writeAgentModelConfig(db, input.revision, {
    enabled: input.enabled,
    ciphertext,
  });
  if (!result.ok)
    return c.json(
      { error: { message: "Configuration changed. Reload before saving." } },
      409,
    );
  return c.json(
    {
      revision: result.revision,
      enabled: input.enabled,
      // Echo masked preview back so the form keeps showing what it saved.
      baseUrl: value.baseUrl,
      model: value.model,
      models: value.models ?? [],
      provider: value.provider,
      apiKeyPreview: maskKey(value.apiKey),
      configured: true,
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

const deleteInputSchema = z.object({ revision: z.string().nullable() }).loose();

agentModelSettingsApi.delete("/", async (c) => {
  try {
    const parsed = deleteInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: { message: "Invalid request" } }, 400);
    const { db } = await getBrowserRequestContext(c);
    const row = await readAgentModelConfig(db);
    if ((row?.revision ?? null) !== parsed.data.revision)
      return c.json(
        { error: { message: "Configuration changed. Reload before clearing." } },
        409,
      );
    // Deleting the row restores the env fallback; the Worker never loses the
    // LLM bridge because resolveAgentModel(env) is the default path.
    await clearAgentModelConfig(db);
    return c.json({ ok: true, revision: null }, 200, {
      "Cache-Control": "no-store",
    });
  } catch (error) {
    return jsonError(c, error);
  }
});