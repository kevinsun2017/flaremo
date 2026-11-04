import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithMagpie } from "./llm";

const PRIMARY = "https://primary.example";
const FALLBACK = "https://fallback.example";
const MODEL = "auto/GLM-5.2";
const KEY = "sk-test";

function env(primary: string, fallback?: string) {
  return {
    FLAREMO_LLM_API_URL: primary,
    FLAREMO_LLM_API_URL_FALLBACK: fallback,
    FLAREMO_LLM_API_KEY: KEY,
    FLAREMO_LLM_MODEL: MODEL,
  } as unknown as Parameters<typeof chatWithMagpie>[0];
}

function okBody() {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: " 连通 " } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function errorBody(status: number) {
  return new Response(JSON.stringify({ error: "boom" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const calledUrls: string[] = [];
let handler: ((url: string) => Promise<Response>) | null = null;

afterEach(() => {
  vi.unstubAllGlobals();
  calledUrls.length = 0;
  handler = null;
});

// Records every URL fetch() hits; resolves via `handler` so each test controls
// the primary/fallback behavior.
function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calledUrls.push(url);
    if (!handler) throw new Error("no handler: test must set handler first");
    return handler(url);
  }));
}

describe("chatCore LLM fallback", () => {
  it("uses the primary when it succeeds and never touches the fallback", async () => {
    stubFetch();
    handler = async () => okBody();
    const content = await chatWithMagpie(env(PRIMARY, FALLBACK), [
      { role: "user", content: "hi" },
    ]);
    expect(content).toBe("连通");
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain(PRIMARY);
  });

  it("retries the fallback when the primary fails with a network error", async () => {
    stubFetch();
    handler = async (url) => {
      if (url.includes(PRIMARY)) throw new TypeError("fetch failed");
      return okBody();
    };
    const content = await chatWithMagpie(env(PRIMARY, FALLBACK), [
      { role: "user", content: "hi" },
    ]);
    expect(content).toBe("连通");
    expect(calledUrls).toHaveLength(2);
    expect(calledUrls[0]).toContain(PRIMARY);
    expect(calledUrls[1]).toContain(FALLBACK);
  });

  it("retries the fallback when the primary returns 5xx", async () => {
    stubFetch();
    handler = async (url) =>
      url.includes(PRIMARY) ? errorBody(500) : okBody();
    const content = await chatWithMagpie(env(PRIMARY, FALLBACK), [
      { role: "user", content: "hi" },
    ]);
    expect(content).toBe("连通");
    expect(calledUrls).toHaveLength(2);
    expect(calledUrls[1]).toContain(FALLBACK);
  });

  it("does NOT retry the fallback on 401 (auth failure)", async () => {
    stubFetch();
    handler = async (url) =>
      url.includes(PRIMARY) ? errorBody(401) : okBody();
    await expect(
      chatWithMagpie(env(PRIMARY, FALLBACK), [
        { role: "user", content: "hi" },
      ]),
    ).rejects.toThrow(/401/);
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain(PRIMARY);
  });

  it("does NOT retry the fallback on 403 (auth failure)", async () => {
    stubFetch();
    handler = async (url) =>
      url.includes(PRIMARY) ? errorBody(403) : okBody();
    await expect(
      chatWithMagpie(env(PRIMARY, FALLBACK), [
        { role: "user", content: "hi" },
      ]),
    ).rejects.toThrow(/403/);
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain(PRIMARY);
  });

  it("throws when primary and fallback both fail", async () => {
    stubFetch();
    handler = async (url) =>
      url.includes(PRIMARY) ? errorBody(503) : errorBody(502);
    await expect(
      chatWithMagpie(env(PRIMARY, FALLBACK), [
        { role: "user", content: "hi" },
      ]),
    ).rejects.toThrow(/both failed/);
    expect(calledUrls).toHaveLength(2);
  });

  it("does not retry when no fallback URL is configured", async () => {
    stubFetch();
    handler = async (url) =>
      url.includes(PRIMARY) ? errorBody(500) : okBody();
    await expect(
      chatWithMagpie(env(PRIMARY), [{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/500/);
    expect(calledUrls).toHaveLength(1);
  });
});