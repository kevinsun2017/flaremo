import {
  canManageVoiceService,
  ForbiddenError,
  readVoiceService,
  writeVoiceService,
} from "@flaremo/domain";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  canEncryptVoiceCredentials,
  configuredVoice,
  openVoiceCredentials,
  resolveVoiceService,
  sealVoiceCredentials,
  type VoiceCredentials,
  voiceCredentialsSchema,
} from "../asr/configuration";
import { getConfiguredAsr } from "../asr/provider";
import { getBrowserRequestContext, type HonoBindings } from "../context";
import { jsonError } from "../http";
import { rateLimitGuard } from "../rate-limit";

export const voiceSettingsApi = new Hono<HonoBindings>();
voiceSettingsApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  try {
    const { user } = await getBrowserRequestContext(c);
    if (!canManageVoiceService(user))
      throw new ForbiddenError("Owner access is required.");
    return await next();
  } catch (error) {
    return jsonError(c, error);
  }
});
voiceSettingsApi.use("*", bodyLimit({ maxSize: 8192 }));

// Secrets are write-only: masked previews are computed server-side and full
// values never leave the Worker. AppID is a non-secret account identifier.
function maskCredential(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

voiceSettingsApi.get("/", async (c) => {
  try {
    return await getVoiceSettings(c);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function getVoiceSettings(c: Context<HonoBindings>) {
  const { db } = await getBrowserRequestContext(c);
  const row = await readVoiceService(db);
  let credentials: VoiceCredentials | null = null;
  let unreadable = false;
  if (row?.ciphertext) {
    try {
      credentials = await openVoiceCredentials(
        c.env.FLAREMO_VOICE_CONFIG_KEY,
        row.ciphertext,
      );
    } catch {
      unreadable = true;
    }
  }
  const envConfigured = getConfiguredAsr(c.env);
  const envManaged = Boolean(envConfigured);
  return c.json(
    {
      revision: row?.revision ?? null,
      enabled: Boolean(row?.enabled && credentials),
      source: envManaged
        ? ("environment" as const)
        : credentials
          ? ("database" as const)
          : ("none" as const),
      configured: envManaged || Boolean(credentials),
      provider: envManaged
        ? (envConfigured?.id ?? null)
        : (credentials?.provider ?? null),
      model: credentials?.model ?? "",
      unreadable,
      previews: credentials
        ? {
            appId: credentials.appId,
            secretId: maskCredential(credentials.secretId),
            secretKey: maskCredential(credentials.secretKey),
            apiKey: maskCredential(credentials.apiKey),
            volcAppId: credentials.volcAppId,
            volcAccessToken: maskCredential(credentials.volcAccessToken),
            volcBoostingTable: credentials.volcBoostingTable,
            volcCorrectTable: credentials.volcCorrectTable,
            minimaxBaseUrl: credentials.minimaxBaseUrl,
          }
        : null,
      encrypted: Boolean(row?.ciphertext?.startsWith('{"v":1')),
      canEncrypt: canEncryptVoiceCredentials(c.env.FLAREMO_VOICE_CONFIG_KEY),
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

const inputSchema = z
  .object({
    revision: z.string().nullable(),
    enabled: z.boolean(),
    credentials: voiceCredentialsSchema,
  })
  .strict();
voiceSettingsApi.put("/", async (c) => {
  try {
    return await putVoiceSettings(c);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function putVoiceSettings(c: Context<HonoBindings>) {
  const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: { message: "Invalid configuration" } }, 400);
  const { db } = await getBrowserRequestContext(c);
  const row = await readVoiceService(db);
  const input = parsed.data;
  if ((row?.revision ?? null) !== input.revision)
    return c.json(
      { error: { message: "Configuration changed. Reload before saving." } },
      409,
    );
  const value = input.credentials;
  if (row?.ciphertext) {
    try {
      const old = await openVoiceCredentials(
        c.env.FLAREMO_VOICE_CONFIG_KEY,
        row.ciphertext,
      );
      if (old.provider === value.provider) {
        value.apiKey ||= old.apiKey;
        value.appId ||= old.appId;
        value.secretId ||= old.secretId;
        value.secretKey ||= old.secretKey;
        value.volcAppId ||= old.volcAppId;
        value.volcAccessToken ||= old.volcAccessToken;
        value.volcBoostingTable ||= old.volcBoostingTable;
        value.volcCorrectTable ||= old.volcCorrectTable;
        value.minimaxBaseUrl ||= old.minimaxBaseUrl;
      }
    } catch {
      return c.json(
        {
          error: {
            message:
              "Stored credentials unavailable. Delete them before replacing.",
          },
        },
        409,
      );
    }
  }
  if (!configuredVoice(value))
    return c.json(
      { error: { message: "Provider credentials or model incomplete" } },
      400,
    );
  // Do not retain credentials for the inactive provider.
  if (value.provider === "tencent") {
    value.apiKey = "";
    value.volcAppId = "";
    value.volcAccessToken = "";
    value.volcBoostingTable = "";
    value.volcCorrectTable = "";
    value.minimaxBaseUrl = "";
  } else if (value.provider === "dashscope") {
    value.appId = "";
    value.secretId = "";
    value.secretKey = "";
    value.volcAppId = "";
    value.volcAccessToken = "";
    value.volcBoostingTable = "";
    value.volcCorrectTable = "";
    value.minimaxBaseUrl = "";
  } else if (value.provider === "minimax") {
    value.appId = "";
    value.secretId = "";
    value.secretKey = "";
    value.volcAppId = "";
    value.volcAccessToken = "";
    value.volcBoostingTable = "";
    value.volcCorrectTable = "";
  } else {
    value.appId = "";
    value.secretId = "";
    value.secretKey = "";
    value.apiKey = "";
    value.minimaxBaseUrl = "";
  }
  const ciphertext = await sealVoiceCredentials(
    c.env.FLAREMO_VOICE_CONFIG_KEY,
    value,
  );
  if (
    !(await writeVoiceService(db, input.revision, {
      enabled: input.enabled,
      ciphertext,
    }))
  )
    return c.json({ error: { message: "Configuration changed" } }, 409);
  return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
}

voiceSettingsApi.delete("/", async (c) => {
  try {
    return await deleteVoiceSettings(c);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function deleteVoiceSettings(c: Context<HonoBindings>) {
  const input = z
    .object({ revision: z.string().nullable() })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    return c.json({ error: { message: "Invalid request" } }, 400);
  const { db } = await getBrowserRequestContext(c);
  if (
    !(await writeVoiceService(db, input.data.revision, {
      enabled: false,
      ciphertext: null,
    }))
  )
    return c.json({ error: { message: "Configuration changed" } }, 409);
  return c.json({ ok: true }); // A disabled tombstone prevents any implicit reactivation after deletion.
}

// Builds 3 seconds of 16 kHz mono s16le silence in a 44-byte RIFF container
// (MiniMax rejects bare PCM). Used to give the batch provider a real —
// billed — transcription test without depending on microphone input.
export function buildSilenceWavBytes(durationMs = 3_000): ArrayBuffer {
  const samples = Math.round((16_000 * durationMs) / 1000);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (const [index, char] of Array.from(text).entries())
      view.setUint8(offset + index, char.charCodeAt(0));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, "data");
  view.setUint32(40, dataSize, true);
  return buffer; // Samples stay zero-filled.
}

// Tests the effective configuration (environment or saved); it never returns
// upstream error text.
voiceSettingsApi.post("/test", async (c) => {
  try {
    return await testVoiceSettings(c);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function testVoiceSettings(c: Context<HonoBindings>) {
  const { user, db } = await getBrowserRequestContext(c);
  const limited = await rateLimitGuard(c, "capture", user.id);
  if (limited) return limited;
  const configured = await resolveVoiceService(c.env, db);
  if (!configured)
    return c.json({ error: { message: "Voice service unavailable" } }, 503);
  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(),
    configured.kind === "batch" ? 30_000 : 8000,
  );
  try {
    if (configured.kind === "batch") {
      // Real transcription (rollout §3.4): a 3 s silent WAV exercises
      // credentials, quota and region, and consumes plan quota like any
      // other request — the panel's testWarning covers the charge.
      await configured.provider.transcribe(buildSilenceWavBytes(), {
        language: "zh",
        signal: abort.signal,
      });
      if (abort.signal.aborted) throw new Error("Connection interrupted");
      return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
    }
    const connection = await configured.provider.connect(
      { sampleRate: 16000 },
      () => {},
      () => abort.abort(),
      abort.signal,
    );
    connection.close();
    if (abort.signal.aborted) throw new Error("Connection interrupted");
    return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch {
    return c.json(
      {
        error: {
          message:
            "Connection test failed. Check credentials, quota and region.",
        },
      },
      502,
    );
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
