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

describe("FlareMo memo context attachments", () => {
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

  it("exposes context attachments newest first and stores uploaded duration", async () => {
    const memo = await createMemo<{ id: string; name: string }>(
      "attachment ordering",
    );

    const formDataOld = new FormData();
    formDataOld.set("memo", memo.name);
    formDataOld.set(
      "file",
      new File(["old"], "old.txt", { type: "text/plain" }),
    );
    const first = await json<{ name: string }>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: formDataOld,
      }),
    );

    const formDataNew = new FormData();
    formDataNew.set("memo", memo.name);
    formDataNew.set(
      "file",
      new File(["RIFF----WAVE"], "clip.wav", { type: "audio/wav" }),
    );
    formDataNew.set("duration", "3");
    const second = await json<{
      name: string;
      payload: Record<string, unknown>;
    }>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: formDataNew,
      }),
    );
    expect(second.payload).toEqual({ duration: 3 });

    // A malformed duration is decoration: ignore it, never fail the upload.
    const formDataBad = new FormData();
    formDataBad.set("memo", memo.name);
    formDataBad.set(
      "file",
      new File(["x"], "broken.wav", { type: "audio/wav" }),
    );
    formDataBad.set("duration", "abc");
    const third = await json<{ payload: Record<string, unknown> }>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: formDataBad,
      }),
    );
    expect(third.payload).toEqual({});

    // The list endpoints order newest first; the reading view must agree.
    const context = await json<{ attachments: Array<{ name: string }> }>(
      await fetchApp(`http://flaremo.test/api/app/memos/${memo.id}`),
    );
    expect(context.attachments.map((attachment) => attachment.name)).toEqual([
      third.name ?? "attachments/missing",
      second.name,
      first.name,
    ]);
  });
});
