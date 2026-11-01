import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAppTestHarness,
  jsonWithStatus as json,
} from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";
import { bootstrapAndSignIn } from "../test-support/sign-in";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp } = createAppTestHarness(() => ({ env, sessionCookie }));

describe("Memos-compatible public share attachments", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createTestRuntime({
      name: "flaremo-memos-compat",
      suffix: "source",
    }));
    sessionCookie = await bootstrapAndSignIn(env);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("keeps public share attachments isolated by share token", async () => {
    const sharedMemo = await createMemo("share isolation memo");
    const sharedFormData = new FormData();
    sharedFormData.set("memo", sharedMemo.name);
    sharedFormData.set(
      "file",
      new File(["shared"], "shared.txt", { type: "text/plain" }),
    );

    const sharedAttachment = await json(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: sharedFormData,
      }),
      201,
    );
    expect(sharedAttachment.name).toMatch(/^attachments\//);

    const share = await json(
      await fetchApp(`http://flaremo.test/api/v1/${sharedMemo.name}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      201,
    );

    const privateMemo = await createMemo("private attachment memo");
    const privateFormData = new FormData();
    privateFormData.set("memo", privateMemo.name);
    privateFormData.set(
      "file",
      new File(["private"], "private.txt", { type: "text/plain" }),
    );
    const privateAttachment = await json(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: privateFormData,
      }),
      201,
    );

    const publicShare = await json(
      await fetchApp(`http://flaremo.test/api/public/shares/${share.token}`),
    );
    expect(publicShare.attachments[0].download_url).toContain(
      sharedAttachment.id,
    );

    const sharedBlob = await fetchApp(
      `http://flaremo.test${publicShare.attachments[0].download_url}`,
    );
    expect(sharedBlob.status).toBe(200);
    expect(await sharedBlob.text()).toBe("shared");

    const privateBlob = await fetchApp(
      `http://flaremo.test/api/public/shares/${share.token}/attachments/${privateAttachment.id}/blob`,
    );
    expect(privateBlob.status).toBe(404);
  });
});

async function createMemo(content: string) {
  return json(
    await fetchApp("http://flaremo.test/api/v1/memos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    }),
    201,
  );
}
