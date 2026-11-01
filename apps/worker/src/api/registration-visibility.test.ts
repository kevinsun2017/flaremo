import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { createAppTestHarness, json } from "../test-support/app";
import { createTestRuntime, TEST_PASSWORD } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp, createActivatedMember, createMemoAs, bootstrapAndSignIn } =
  createAppTestHarness(() => ({
    env,
    sessionCookie,
  }));

describe("FlareMo registration visibility and search scope", () => {
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

  it("rejects public registration while the deployment default keeps it closed", async () => {
    const status = await json<{ registration_open: boolean }>(
      await fetchApp("http://flaremo.test/api/auth/flaremo/register/status"),
    );
    expect(status.registration_open).toBe(false);

    const settings = await json<{ registration_open: boolean }>(
      await fetchApp("http://flaremo.test/api/app/admin/settings"),
    );
    expect(settings.registration_open).toBe(false);

    const closed = await fetchApp(
      "http://flaremo.test/api/auth/flaremo/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // fetchApp only auto-supplies the origin on /api/app and /api/v1
          // paths; the anonymous register endpoint needs it explicitly.
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          name: "Member",
          email: "closed-default@example.com",
          password: TEST_PASSWORD,
        }),
      },
    );
    expect(closed.status).toBe(403);
    expect(await closed.json()).toEqual({
      error: { message: "Registration is currently closed." },
    });

    // The rejected registration must not leave a member behind.
    const users = await env.DB.prepare("SELECT id FROM users").all<{
      id: string;
    }>();
    expect(users.results.map((row) => row.id)).toEqual(["users/owner"]);
  });

  it("keeps a member's private memos out of other members' full-text search", async () => {
    const author = await createActivatedMember(
      "search-author@example.com",
      "Search Author",
    );
    const reader = await createActivatedMember(
      "search-reader@example.com",
      "Search Reader",
    );

    const authorPrivateId = await createMemoAs(
      author.cookie,
      "veilstone-crystal private plan",
      "private",
    );
    const authorTeamId = await createMemoAs(
      author.cookie,
      "veilstone-crystal team plan",
      "protected",
    );

    // Member B's full-text search must not surface member A's private memo.
    const readerSearch = await json<{ memos: Array<{ id: string }> }>(
      await app.fetch(
        new Request("http://flaremo.test/api/app/memos?q=veilstone-crystal", {
          headers: { cookie: reader.cookie },
        }),
        env,
      ),
    );
    expect(readerSearch.memos.map((memo) => memo.id)).toEqual([authorTeamId]);

    // The administrator's search is bound by the same visibility matrix.
    const adminSearch = await json<{ memos: Array<{ id: string }> }>(
      await fetchApp("http://flaremo.test/api/app/memos?q=veilstone-crystal"),
    );
    expect(adminSearch.memos.map((memo) => memo.id)).toEqual([authorTeamId]);

    // The legacy Memos-compatible wire applies the same boundary; its DTO
    // exposes the row id as `name` and the bare uuid as `id`.
    const legacySearch = await json<{ memos: Array<{ name: string }> }>(
      await app.fetch(
        new Request("http://flaremo.test/api/v1/memos?q=veilstone-crystal", {
          headers: { cookie: reader.cookie, "x-flaremo-wire": "legacy" },
        }),
        env,
      ),
    );
    expect(legacySearch.memos.map((memo) => memo.name)).toEqual([
      `memos/${authorTeamId}`,
    ]);

    // Positive control: the author still finds both of her own notes.
    const authorSearch = await json<{ memos: Array<{ id: string }> }>(
      await app.fetch(
        new Request("http://flaremo.test/api/app/memos?q=veilstone-crystal", {
          headers: { cookie: author.cookie },
        }),
        env,
      ),
    );
    expect(authorSearch.memos.map((memo) => memo.id).sort()).toEqual(
      [authorPrivateId, authorTeamId].sort(),
    );
  });
});
