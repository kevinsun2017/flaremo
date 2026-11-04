import { type FlareMoDb } from "@flaremo/db";
import { readAgentModelConfig } from "@flaremo/domain";
import { z } from "zod";
import type { FlareMoEnv } from "../env";

/**
 * Instance-level Agent LLM selection, stored in D1 as an encrypted envelope
 * (mirrors the voice capture pattern). While unset the Worker falls back to
 * the classic FLAREMO_LLM_API_URL / _API_KEY / _MODEL secrets, so existing
 * installs keep working with zero config and upgrades never need to touch
 * this row.
 *
 * The schema is deliberately loose (not strict): future fields added on
 * upgrade remain readable, so a saved payload is never clobbered by a newer
 * code version.
 */
export const agentModelSchema = z
  .object({
    provider: z.enum(["openrouter", "nvidia", "custom"]),
    baseUrl: z.string().trim().max(256).default(""),
    apiKey: z.string().trim().max(2048).default(""),
    // `model` is the currently active model id (kept for chat routing and
    // backwards compatibility with v0/v1 envelopes).
    model: z.string().trim().max(256).default(""),
    // The full model catalog the owner picked from. Each entry carries the
    // provider-reported id and a human label.
    models: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(256),
          displayName: z.string().trim().max(256).optional().default(""),
        }),
      )
      .optional()
      .default([]),
    // Reserve room for future per-install fields without a shape migration.
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();
export type AgentModelConfig = z.infer<typeof agentModelSchema>;

export type ResolvedAgentModel = {
  provider: AgentModelConfig["provider"];
  baseUrl: string;
  apiKey: string;
  model: string;
};

const AAD = new TextEncoder().encode("flaremo:agent-model:v1");

function hasEncryptionKey(secret: string | undefined) {
  return Boolean(secret && secret.length >= 32);
}

/** UI hint: whether saved configuration can be encrypted at rest. */
export function canEncryptAgentModelConfig(secret: string | undefined) {
  return hasEncryptionKey(secret);
}

export async function encryptionKey(secret: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// Envelope v0 stores the payload as JSON (D1 is encrypted at rest);
// v1 is AES-GCM ciphertext bound to the static AAD. v1 without the matching
// key fails closed on open.
export async function sealAgentModel(
  secret: string | undefined,
  value: AgentModelConfig,
) {
  if (!secret || !hasEncryptionKey(secret)) {
    return JSON.stringify({ v: 0, data: value });
  }
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    v: 1,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  });
}

export async function openAgentModel(
  secret: string | undefined,
  envelope: string,
): Promise<AgentModelConfig> {
  const value = JSON.parse(envelope);
  if (value.v === 0) return agentModelSchema.parse(value.data);
  if (value.v !== 1) throw new Error("Invalid agent model envelope version");
  if (!secret || !hasEncryptionKey(secret))
    throw new Error("Agent model encryption key unavailable");
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(value.iv), additionalData: AAD },
    key,
    new Uint8Array(value.data),
  );
  return agentModelSchema.parse(
    JSON.parse(new TextDecoder().decode(plaintext)),
  );
}

/** Whether the config is complete enough to actually route a chat request. */
export function isAgentModelComplete(value: AgentModelConfig): boolean {
  return Boolean(value.baseUrl.trim() && value.model.trim());
}

export type AgentModelCatalogEntry = {
  id: string;
  displayName: string;
};

// Normalize provider /models listings (OpenRouter, NVIDIA NIM, and most
// OpenAI-compatible gateways all return { data: [{ id, name? }] }).
const catalogResponseSchema = z
  .object({
    data: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          name: z.string().trim().optional(),
        }),
      )
      .optional()
      .default([]),
  })
  .loose()
  .passthrough();

function normalizeCatalog(raw: unknown): AgentModelCatalogEntry[] {
  // Accept both the bare `data` array and the wrapped `{ data: [...] }` body,
  // since the schema below describes the wrapper shape. Passing a raw array
  // straight into a z.object() schema always fails safeParse and silently
  // yields [], which made OpenRouter look like it had no models.
  const data = Array.isArray(raw)
    ? raw
    : (raw as { data?: unknown } | null)?.data;
  const parsed = catalogResponseSchema.safeParse({ data });
  if (!parsed.success) return [];
  return parsed.data.data.map((entry) => ({
    id: entry.id,
    displayName: entry.name || entry.id,
  }));
}

/**
 * Fetch the provider's model catalog using baseUrl + apiKey. Returns [] when
 * the endpoint is absent (some custom gateways skip /models). Throws on a
 * non-2xx / auth failure so callers can reject saving with a bad key.
 */
export async function fetchAgentModelCatalog(
  baseUrl: string,
  apiKey: string,
): Promise<AgentModelCatalogEntry[]> {
  const base = baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  // Try the OpenAI-compatible path first, then the bare path.
  for (const path of [`${base}/v1/models`, `${base}/models`]) {
    const res = await fetch(path, { method: "GET", headers });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as {
        data?: unknown;
      } | null;
      return normalizeCatalog(body?.data);
    }
    // 404/405 → try next path; anything else (401/403/429) is an auth/rate
    // failure we should surface to the caller.
    if (res.status !== 404 && res.status !== 405) {
      throw new Error(`Model catalog request failed (${res.status})`);
    }
  }
  // Both endpoints absent — treat as a gateway with no /models.
  return [];
}

function fallbackFromEnv(env: FlareMoEnv): ResolvedAgentModel | null {
  const base = env.FLAREMO_LLM_API_URL;
  if (!base) return null;
  return {
    provider: env.FLAREMO_LLM_MODEL?.startsWith("openrouter")
      ? "openrouter"
      : env.FLAREMO_LLM_MODEL?.startsWith("nvidia")
        ? "nvidia"
        : "custom",
    baseUrl: base,
    apiKey: env.FLAREMO_LLM_API_KEY ?? "",
    model: env.FLAREMO_LLM_MODEL ?? "auto/GLM-5.2",
  };
}

// Database config wins when fully configured; otherwise fall back to env
// secrets so upgrades / unset rows never break the agent.
export async function resolveAgentModel(
  env: FlareMoEnv,
  db: FlareMoDb,
): Promise<ResolvedAgentModel | null> {
  const row = await readAgentModelConfig(db);
  if (row?.enabled && row.ciphertext) {
    try {
      const value = await openAgentModel(
        env.FLAREMO_AGENT_MODEL_CONFIG_KEY,
        row.ciphertext,
      );
      if (isAgentModelComplete(value)) {
        return {
          provider: value.provider,
          baseUrl: value.baseUrl,
          apiKey: value.apiKey,
          model: value.model,
        };
      }
    } catch {
      // Fall through to env on unreadable stored config.
    }
  }
  return fallbackFromEnv(env);
}