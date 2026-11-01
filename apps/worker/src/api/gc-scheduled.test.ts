import type { ListAppNotificationsResponse } from "@flaremo/contracts";
import { createDb, memos } from "@flaremo/db";
import { eq } from "drizzle-orm";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { createAppTestHarness, json } from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp, createMemo, uploadAttachment, bootstrapAndSignIn } =
  createAppTestHarness(() => ({
    env,
    sessionCookie,
  }));

describe("FlareMo attachment GC and scheduled jobs", () => {
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

  it("supports byte ranges, hard-delete cleanup, and scheduled orphan cleanup", async () => {
    const memo = await createMemo("attachment lifecycle");
    const formData = new FormData();
    formData.set("memo", memo.name);
    formData.set(
      "file",
      new File(["0123456789"], "range.txt", { type: "text/plain" }),
    );
    const attachment = await json(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: formData,
      }),
    );

    const partial = await fetchApp(
      `http://flaremo.test/api/v1/${attachment.name}/blob?disposition=inline`,
      { headers: { range: "bytes=2-5" } },
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await partial.text()).toBe("2345");

    await json(
      await fetchApp(`http://flaremo.test/api/app/memos/${memo.id}?hard=true`, {
        method: "DELETE",
      }),
    );
    expect(
      await fetchApp(`http://flaremo.test/api/v1/${attachment.name}`),
    ).toMatchObject({ status: 404 });

    const orphanData = new FormData();
    orphanData.set(
      "file",
      new File(["orphan"], "orphan.txt", { type: "text/plain" }),
    );
    const orphan = await json(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: orphanData,
      }),
    );
    await app.scheduled(
      {
        // Past the 7-day unbound-orphan grace period, so the created orphan
        // is inside the GC window.
        scheduledTime: Date.now() + 9 * 24 * 60 * 60 * 1_000,
      } as ScheduledController,
      env,
    );
    expect(
      await fetchApp(`http://flaremo.test/api/v1/${orphan.name}`),
    ).toMatchObject({ status: 404 });
  });

  it("recovers a raw memo-row delete through the attachment GC", async () => {
    const memo = await createMemo("rogue hard delete");
    const attachment = await uploadAttachment(memo.name);
    // A hard-delete path that skips the marker entirely: drop the memo row
    // directly so attachment rows keep no `deleting` state — only the
    // unbound-orphan clause can still reclaim the binary. (Production D1
    // nulls attachment.memo_id via the FK cascade; Miniflare does not, so
    // mimic that step explicitly.)
    await env.DB.prepare(
      "UPDATE attachments SET memo_id = NULL WHERE memo_id = ?",
    )
      .bind(memo.name)
      .run();
    await env.DB.prepare("DELETE FROM memos WHERE id = ?")
      .bind(memo.name)
      .run();
    await app.scheduled(
      {
        scheduledTime: Date.now() + 9 * 24 * 60 * 60 * 1_000,
      } as ScheduledController,
      env,
    );
    expect(
      await fetchApp(`http://flaremo.test/api/v1/${attachment.name}`),
    ).toMatchObject({ status: 404 });
  });

  it("purges recycle-bin memos past the trash retention window", async () => {
    const memo = await createMemo("expired trash");
    const attachment = await uploadAttachment(memo.name);
    await json(
      await fetchApp(`http://flaremo.test/api/app/memos/${memo.id}`, {
        method: "DELETE",
      }),
    );
    // Backdate deletedAt beyond the default 30-day retention. Raw D1 here:
    // drizzle updates without a consuming clause don't always flush in the
    // Miniflare test harness.
    await env.DB.prepare("UPDATE memos SET deleted_at = ? WHERE id = ?")
      .bind(
        new Date(Date.now() - 45 * 24 * 60 * 60 * 1_000).toISOString(),
        memo.name,
      )
      .run();
    await app.scheduled(
      { scheduledTime: Date.now() } as ScheduledController,
      env,
    );
    expect(
      await fetchApp(`http://flaremo.test/api/app/memos/${memo.id}`),
    ).toMatchObject({ status: 404 });
    expect(
      await fetchApp(`http://flaremo.test/api/v1/${attachment.name}`),
    ).toMatchObject({ status: 404 });
  });

  it("creates idempotent daily review notifications from the scheduled run", async () => {
    const scheduledTime = Date.now();
    const runScheduled = () =>
      app.scheduled({ scheduledTime } as ScheduledController, env);
    const listNotifications = async () => {
      const response = await fetchApp(
        "http://flaremo.test/api/app/notifications",
      );
      if (!response.ok) {
        throw new Error(
          `list failed: ${response.status} ${await response.text()}`,
        );
      }
      return json<ListAppNotificationsResponse>(response);
    };

    // Without on-this-day history the cron run files nothing.
    await runScheduled();
    expect((await listNotifications()).notifications).toEqual([]);

    const memo = await createMemo<{ id: string; name: string }>(
      "on this day last year",
    );
    const lastYear = new Date(scheduledTime);
    lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
    await createDb(env.DB)
      .update(memos)
      .set({ createdAt: lastYear.toISOString() })
      .where(eq(memos.id, memo.name));

    await runScheduled();
    const first = await listNotifications();
    expect(first.notifications).toHaveLength(1);
    expect(first.notifications[0]).toMatchObject({
      type: "daily_review",
      status: "unread",
      memo: memo.name,
      memo_snippet: "on this day last year",
    });

    // The receiver/source-event/type unique index makes a repeat run a no-op.
    await runScheduled();
    expect((await listNotifications()).notifications).toHaveLength(1);

    const notificationId = first.notifications[0].name.split("/").pop() ?? "";
    const archived = await json<{ status: string }>(
      await fetchApp(
        `http://flaremo.test/api/app/notifications/${notificationId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        },
      ),
    );
    expect(archived.status).toBe("archived");
    expect((await listNotifications()).notifications[0].status).toBe(
      "archived",
    );
  });
});
