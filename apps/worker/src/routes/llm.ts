import type { FlareMoEnv } from "../env";

/**
 * Minimal OpenAI-compatible chat bridge for the Agent (P1). Speaks to the
 * local Magpie bridge (or any OpenAI-compatible endpoint) at FLAREMO_LLM_API_URL.
 *
 * Non-streaming for now (P1); SSE streaming is P4. The model id defaults to
 * Magpie's auto routing group.
 */
const DEFAULT_MODEL = "auto/GLM-5.2";

export async function chatWithMagpie(
  env: FlareMoEnv,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const base = env.FLAREMO_LLM_API_URL;
  if (!base) {
    throw new Error(
      "FLAREMO_LLM_API_URL not set — agent chat needs an LLM bridge",
    );
  }
  const model = env.FLAREMO_LLM_MODEL ?? DEFAULT_MODEL;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.FLAREMO_LLM_API_KEY) {
    headers.authorization = `Bearer ${env.FLAREMO_LLM_API_KEY}`;
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM bridge error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("LLM bridge returned empty completion");
  }
  return content;
}