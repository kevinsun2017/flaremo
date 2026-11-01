import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppTestHarness, json } from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp, createMemo, bootstrapAndSignIn } = createAppTestHarness(
  () => ({
    env,
    sessionCookie,
  }),
);

describe("FlareMo offline replay API", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createTestRuntime({
      databaseName: "flaremo-test",
      attachmentsName: "flaremo-attachments-test",
      env: { FLAREMO_DEPLOY_REPOSITORY: "example/flaremo" },
    }));
    sessionCookie = await bootstrapAndSignIn();
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("initializes the single owner idempotently under concurrent requests", async () => {
    const [memosResponse, statsResponse] = await Promise.all([
      fetchApp("http://flaremo.test/api/app/memos"),
      fetchApp("http://flaremo.test/api/app/stats?time_zone=UTC"),
    ]);
    expect(memosResponse.status).toBe(200);
    expect(statsResponse.status).toBe(200);
  });

  it("replays an offline memo submission without creating a duplicate", async () => {
    const clientId = "offline-retry-8ec6d4b4-8d49-4cf6-8cb0-14cfe64d9d7c";
    const first = await json<{ id: string; name: string; content: string }>(
      await fetchApp("http://flaremo.test/api/app/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "Saved while offline",
          payload: { client_id: clientId },
        }),
      }),
    );
    const updated = await json<{ payload: { client_id?: string } }>(
      await fetchApp(`http://flaremo.test/api/app/memos/${first.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { tags: ["offline"] } }),
      }),
    );
    expect(updated.payload.client_id).toBe(clientId);
    const replay = await json<{ name: string; content: string }>(
      await fetchApp("http://flaremo.test/api/app/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "This retry must not create another memo",
          payload: { client_id: clientId },
        }),
      }),
    );

    expect(replay).toMatchObject({
      name: first.name,
      content: "Saved while offline",
    });
    const list = await json<{ memos: Array<{ name: string }> }>(
      await fetchApp("http://flaremo.test/api/app/memos"),
    );
    expect(list.memos.filter((memo) => memo.name === first.name)).toHaveLength(
      1,
    );
  });

  it("replays an offline attachment upload without duplicating it", async () => {
    const memo = await createMemo<{ name: string }>("attachment replay memo");
    const clientId = "offline-attachment-8ec6d4b4-8d49-4cf6-8cb0-14cfe64d9d7c";
    const createFormData = () => {
      const formData = new FormData();
      formData.set("memo", memo.name);
      formData.set("client_id", clientId);
      formData.set(
        "file",
        new File(["attachment replay"], "replay.txt", {
          type: "text/plain",
        }),
      );
      return formData;
    };

    const first = await json<{ name: string }>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: createFormData(),
      }),
    );
    const replay = await json<{ name: string }>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: createFormData(),
      }),
    );

    expect(replay.name).toBe(first.name);
    const attached = await json<{ attachments: Array<{ name: string }> }>(
      await fetchApp(`http://flaremo.test/api/v1/${memo.name}/attachments`),
    );
    expect(attached.attachments).toHaveLength(1);
    expect(attached.attachments[0]?.name).toBe(first.name);
  });
});
