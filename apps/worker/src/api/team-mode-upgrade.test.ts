import { applyFlaremoMigrations } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppTestHarness, json } from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp, bootstrapAndSignIn } = createAppTestHarness(() => ({
  env,
  sessionCookie,
}));

describe("FlareMo team-mode upgrade migration", () => {
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

  it("converts legacy protected memos to private during the team-mode upgrade", async () => {
    // Rebuild the shared harness so migration 0014 runs on top of legacy data
    // instead of over an empty database.
    await mf.dispose();
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-upgrade-test" },
      r2Buckets: { ATTACHMENTS: "flaremo-attachments-upgrade-test" },
    });
    const database = await mf.getD1Database("DB");
    env = {
      ...env,
      DB: database,
      ATTACHMENTS: await mf.getR2Bucket("ATTACHMENTS"),
    } as Env;

    // A pre-team-mode deployment: no users.status column, `protected` in use.
    await applyFlaremoMigrations(database, { beforeTag: "0014_" });
    await database
      .prepare(
        "INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES ('users/owner', 'owner@example.com', 'Owner', 'owner', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      )
      .run();
    const seedLegacyMemo = (id: string, visibility: string) =>
      database
        .prepare(
          "INSERT INTO memos (id, user_id, content, visibility, created_at, updated_at) VALUES (?, 'users/owner', ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(id, `legacy ${visibility} memo`, visibility)
        .run();
    await seedLegacyMemo("memos/legacy-team", "protected");
    await seedLegacyMemo("memos/legacy-public", "public");
    await database
      .prepare(
        "INSERT INTO attachments (id, user_id, memo_id, r2_key, filename, created_at, updated_at) VALUES ('attachments/legacy', 'users/owner', 'memos/legacy-team', 'legacy/object', 'legacy.txt', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      )
      .run();

    await applyFlaremoMigrations(database, { fromTag: "0014_" });
    sessionCookie = await bootstrapAndSignIn();

    const upgraded = await database
      .prepare(
        "SELECT id, visibility FROM memos WHERE id LIKE 'memos/legacy-%'",
      )
      .all<{ id: string; visibility: string }>();
    expect(
      Object.fromEntries(
        upgraded.results.map((row) => [row.id, row.visibility]),
      ),
    ).toEqual({
      "memos/legacy-team": "private",
      "memos/legacy-public": "public",
    });

    // The converted memo keeps working as the owner's private note. The app
    // route takes the bare id and resolves the `memos/`-prefixed row itself.
    const context = await json<{
      memo: { visibility: string; content: string };
    }>(await fetchApp("http://flaremo.test/api/app/memos/legacy-team"));
    expect(context.memo).toMatchObject({
      visibility: "private",
      content: "legacy protected memo",
    });

    expect(
      await database
        .prepare("SELECT status FROM users WHERE id = 'users/owner'")
        .first<{ status: string }>(),
    ).toEqual({ status: "active" });
    expect(
      await database
        .prepare(
          "SELECT memo_id, r2_key, filename FROM attachments WHERE id = 'attachments/legacy'",
        )
        .first<{ filename: string; memo_id: string; r2_key: string }>(),
    ).toEqual({
      filename: "legacy.txt",
      memo_id: "memos/legacy-team",
      r2_key: "legacy/object",
    });
    const upgradeObjects = await database
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('member_removal_jobs', 'users_role_status_idx', 'memos_user_created_id_idx', 'attachments_cleanup_idx') ORDER BY name",
      )
      .all<{ name: string }>();
    expect(upgradeObjects.results.map((row) => row.name)).toEqual([
      "attachments_cleanup_idx",
      "member_removal_jobs",
      "memos_user_created_id_idx",
    ]);
  });
});
