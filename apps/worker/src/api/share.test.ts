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

describe("FlareMo public share API", () => {
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

  it("serves public share content and attachments by token only", async () => {
    const memo = await createMemo("shareable memo #public");
    const formData = new FormData();
    formData.set("memo", memo.name);
    formData.set(
      "file",
      new File(["shared attachment"], "shared.txt", { type: "text/plain" }),
    );
    const sharedAttachment = await json<{ name: string }>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: formData,
      }),
    );

    const share = await json(
      await fetchApp(`http://flaremo.test/api/v1/${memo.name}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    const publicShare = await json(
      await fetchApp(`http://flaremo.test/api/public/shares/${share.token}`),
    );
    expect(publicShare.memo.content).toBe("shareable memo #public");
    expect(publicShare.share.token).toBeUndefined();
    expect(publicShare.attachments[0].download_url).toContain(
      `/api/public/shares/${share.token}/attachments/`,
    );

    const blob = await fetchApp(
      `http://flaremo.test${publicShare.attachments[0].download_url}`,
    );
    expect(blob.ok).toBe(true);
    expect(await blob.text()).toBe("shared attachment");

    const memosWebShareFile = await fetchApp(
      `http://flaremo.test/file/${sharedAttachment.name}/shared.txt?share_token=${encodeURIComponent(share.token)}`,
      undefined,
      { authenticated: false },
    );
    expect(memosWebShareFile.status).toBe(200);
    expect(memosWebShareFile.headers.get("cache-control")).toContain("public");
    expect(await memosWebShareFile.text()).toBe("shared attachment");

    const invalidShareFile = await fetchApp(
      `http://flaremo.test/file/${sharedAttachment.name}/shared.txt?share_token=invalid-token`,
      undefined,
      { authenticated: false },
    );
    expect(invalidShareFile.status).toBe(404);

    const otherMemo = await createMemo("not shared");
    const otherFormData = new FormData();
    otherFormData.set("memo", otherMemo.name);
    otherFormData.set(
      "file",
      new File(["not shared"], "private.txt", { type: "text/plain" }),
    );
    const otherAttachment = await json(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: otherFormData,
      }),
    );
    const forbiddenBlob = await fetchApp(
      `http://flaremo.test/api/public/shares/${share.token}/attachments/${otherAttachment.id}/blob`,
    );
    expect(forbiddenBlob.status).toBe(404);

    const forbiddenMemosWebFile = await fetchApp(
      `http://flaremo.test/file/${otherAttachment.name}/private.txt?share_token=${encodeURIComponent(share.token)}`,
      undefined,
      { authenticated: false },
    );
    expect(forbiddenMemosWebFile.status).toBe(404);

    await json(
      await fetchApp(`http://flaremo.test/api/v1/${memo.name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
    );
    const archivedShare = await fetchApp(
      `http://flaremo.test/api/public/shares/${share.token}`,
    );
    expect(archivedShare.status).toBe(404);
  });
});
