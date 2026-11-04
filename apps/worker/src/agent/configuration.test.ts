import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAgentModelCatalog } from "./configuration";

/** Simple fetch mock keyed by URL, returning a JSON body with a status. */
function stubCatalogEndpoints(...responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  const mock = vi.fn(async () => {
    const { status, body } = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchAgentModelCatalog", () => {
  it("normalizes an OpenRouter-style wrapped catalog body", async () => {
    stubCatalogEndpoints({
      status: 200,
      body: {
        data: [
          { id: "openai/gpt-5", name: "GPT-5" },
          { id: "tencent/hy4" }, // name is optional
        ],
        unused: { x: 1 }, // extra keys ignored
      },
    });
    const models = await fetchAgentModelCatalog(
      "https://openrouter.ai/api",
      "sk-test",
    );
    expect(models).toEqual([
      { id: "openai/gpt-5", displayName: "GPT-5" },
      { id: "tencent/hy4", displayName: "tencent/hy4" },
    ]);
  });

  it("tries the /v1/models path before the bare /models path", async () => {
    const fetchMock = stubCatalogEndpoints(
      { status: 404, body: { error: "Not Found" } },
      { status: 200, body: { data: [{ id: "a/b", name: "A/B" }] } },
    );
    const models = await fetchAgentModelCatalog(
      "https://gw.example",
      "",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://gw.example/v1/models");
    expect(fetchMock.mock.calls[1][0]).toBe("https://gw.example/models");
    expect(models).toEqual([{ id: "a/b", displayName: "A/B" }]);
  });

  it("passes the api key as a Bearer header", async () => {
    const fetchMock = stubCatalogEndpoints({
      status: 200,
      body: { data: [] },
    });
    await fetchAgentModelCatalog("https://gw.example", "sk-secret");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({
      authorization: "Bearer sk-secret",
    });
  });

  it("throws on an auth failure instead of returning []", async () => {
    stubCatalogEndpoints({ status: 401, body: { error: "unauthorized" } });
    await expect(
      fetchAgentModelCatalog("https://gw.example", "bad-key"),
    ).rejects.toThrow(/request failed \(401\)/i);
  });

  it("returns [] when every endpoint is absent (404/405)", async () => {
    stubCatalogEndpoints(
      { status: 404, body: {} },
      { status: 405, body: {} },
    );
    const models = await fetchAgentModelCatalog("https://gw.example", "sk");
    expect(models).toEqual([]);
  });
});