import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMemosTransportHarness,
  createMemosTransportRuntime,
  signInMemosNative,
} from "../test-support/memos-transport";

let mf: Miniflare;
let env: Env;
let accessToken: string;

const { connect, request } = createMemosTransportHarness(() => ({
  env,
  accessToken,
}));

describe("Memos SSE stream", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createMemosTransportRuntime());
    ({ accessToken } = await signInMemosNative(env));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("requires authentication for the SSE stream", async () => {
    const unauthenticated = await request("/api/v1/sse");
    expect(unauthenticated.status).toBe(401);
  });

  it("streams the connected comment and replays memo events", async () => {
    // Last-Event-ID replay walks the runtime's event cursor from zero, so the
    // stream needs one memo.created event in this test's fresh database.
    await connect("CreateMemo", { memo: { content: "Connect JSON memo" } });

    const abortController = new AbortController();
    const sse = await request("/api/v1/sse", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "last-event-id": "0",
      },
      signal: abortController.signal,
    });
    expect(sse.status).toBe(200);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    const reader = sse.body?.getReader();
    expect(reader).toBeTruthy();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toContain(": connected");
    const replay = await reader?.read();
    expect(new TextDecoder().decode(replay?.value)).toMatch(
      /id: \d+\ndata: \{"type":"memo\.created","name":"memos\//,
    );
    abortController.abort();
    await reader?.cancel();
  });
});
