import type { FlareMoDb } from "@flaremo/db";
import { resolveAgentModel } from "../agent/configuration";
import type { FlareMoEnv } from "../env";

/**
 * Minimal OpenAI-compatible chat bridge for the Agent (P1).
 *
 * Non-streaming for now (P1); SSE streaming is P4. The model id defaults to
 * Magpie's auto routing group.
 */
const DEFAULT_MODEL = "auto/GLM-5.2";

type ChatMessage = Array<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

export async function chatWithMagpie(
  env: FlareMoEnv,
  messages: ChatMessage,
): Promise<string> {
  const base = env.FLAREMO_LLM_API_URL;
  const resolved = {
    baseUrl: base ?? "",
    apiKey: env.FLAREMO_LLM_API_KEY ?? "",
    model: env.FLAREMO_LLM_MODEL ?? DEFAULT_MODEL,
  };
  return chatCore(resolved, messages, env.FLAREMO_LLM_API_URL_FALLBACK);
}

// DB-resolved agent model (settings panel) when configured, else env secrets.
// Prefer this in request handlers with a database handle.
export async function chatWithAgentModel(
  env: FlareMoEnv,
  db: FlareMoDb,
  messages: ChatMessage,
): Promise<string> {
  const resolved = await resolveAgentModel(env, db);
  if (!resolved) {
    throw new Error(
      "LLM not configured — set Agent model in Settings or FLAREMO_LLM_API_URL",
    );
  }
  return chatCore(
    { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, model: resolved.model },
    messages,
    env.FLAREMO_LLM_API_URL_FALLBACK,
  );
}

type AttemptResult =
  | { ok: true; content: string }
  | { ok: false; status: number | null; detail: string };

async function chatCore(
  resolved: { baseUrl: string; apiKey: string; model: string },
  messages: ChatMessage,
  fallbackUrl?: string,
): Promise<string> {
  const base = resolved.baseUrl;
  if (!base) {
    throw new Error("LLM bridge URL not set");
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (resolved.apiKey) {
    headers.authorization = `Bearer ${resolved.apiKey}`;
  }
  const body = JSON.stringify({
    model: resolved.model,
    messages,
    temperature: 0.7,
  });

  const attempt = async (url: string): Promise<AttemptResult> => {
    try {
      // 30s cap surfaces dead primaries promptly instead of hanging forever.
      const res = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
          ok: false,
          status: res.status,
          detail: detail.slice(0, 500),
        };
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content
        ? { ok: true, content }
        : { ok: false, status: null, detail: "empty completion" };
    } catch (error) {
      // fetch threw: network failure or timeout (AbortSignal.timeout).
      return {
        ok: false,
        status: null,
        detail: error instanceof Error ? error.message : "network error",
      };
    }
  };

  // Primary attempt.
  const primary = await attempt(base);
  if (primary.ok) {
    console.log(`LLM primary OK: ${base} (model ${resolved.model})`);
    return primary.content;
  }

  // Fallback only for transient failures (network/timeout, 5xx). Auth
  // failures (401/403) are not retried — switching URLs would not fix a
  // rejected Bearer token.
  const retryable =
    primary.status === null || (primary.status !== null && primary.status >= 500);
  if (retryable && fallbackUrl) {
    console.warn(
      `LLM fallback to backup: primary ${base} failed (${primary.status ?? "network"} — ${primary.detail}), trying ${fallbackUrl}`,
    );
    const backup = await attempt(fallbackUrl);
    if (backup.ok) {
      console.log(`LLM backup OK: ${fallbackUrl} (model ${resolved.model})`);
      return backup.content;
    }
    throw new Error(
      `LLM bridge error: primary ${primary.status ?? "network error"} and fallback ${backup.status ?? "network error"} both failed`,
    );
  }

  throw new Error(
    `LLM bridge error ${primary.status ?? "network error"}: ${primary.detail.slice(0, 300)}`,
  );
}