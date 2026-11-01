import type { UserRow } from "@flaremo/db";
import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDataTask,
  deleteExpiredDataTasks,
  expireStaleDataTasks,
  failDataTask,
  getDataTask,
  updateDataTask,
} from "./data-tasks";
import { NotFoundError } from "./errors";
import { createTeamMember, ensureTeamOwner } from "./test-support";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let user: UserRow;

describe("data tasks", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-data-tasks-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
    user = await ensureTeamOwner(db);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("creates tasks queued and scopes reads to the owner", async () => {
    const task = await createDataTask(db, user, {
      kind: "export",
      phase: "created",
    });
    expect(task.status).toBe("queued");
    expect(task.kind).toBe("export");

    const other = await createTeamMember(db, "Other");
    await expect(getDataTask(db, other, task.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("marks stale leases failed and deletes rows past the TTL", async () => {
    const task = await createDataTask(db, user, {
      kind: "export",
      phase: "created",
    });
    // Pretend the lease lapsed.
    await updateDataTask(db, task.id, {
      status: "running",
      leaseUntil: new Date(Date.now() - 1000).toISOString(),
    });
    const expired = await expireStaleDataTasks(db);
    expect(expired).toBe(1);
    const afterExpire = await getDataTask(db, user, task.id);
    expect(afterExpire.status).toBe("failed");
    expect(afterExpire.errorCode).toBe("task_expired");

    const runAgain = await expireStaleDataTasks(db);
    expect(runAgain).toBe(0);

    await failDataTask(db, task.id, "boom", "details");
    const removed = await deleteExpiredDataTasks(
      db,
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );
    expect(removed.length).toBe(1);
    await expect(getDataTask(db, user, task.id)).rejects.toThrow(NotFoundError);
  });
});
