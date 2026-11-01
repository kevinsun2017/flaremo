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

describe("Memos-compatible memo DTO", () => {
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

  it("keeps core memo DTO shape stable", async () => {
    const created = await json(
      await fetchApp("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "contract memo #compat",
          visibility: "protected",
          payload: {
            tags: ["compat"],
            property: { has_link: true },
          },
        }),
      }),
      201,
    );

    expect(created).toMatchObject({
      name: expect.stringMatching(/^memos\//),
      id: expect.any(String),
      content: "contract memo #compat",
      visibility: "protected",
      state: "normal",
      pinned: false,
      creator: expect.stringMatching(/^users\//),
      payload: {
        tags: ["compat"],
      },
    });
    expect(created.create_time).toEqual(expect.any(String));
    expect(created.update_time).toEqual(expect.any(String));
    expect(created.display_time).toEqual(expect.any(String));

    const listed = await json(
      await fetchApp("http://flaremo.test/api/v1/memos?tag=compat"),
    );
    expect(listed.memos).toHaveLength(1);
    expect(listed.memos[0].name).toBe(created.name);

    const updated = await json(
      await fetchApp(`http://flaremo.test/api/v1/${created.name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pinned: true, visibility: "public" }),
      }),
    );
    expect(updated.pinned).toBe(true);
    expect(updated.visibility).toBe("public");
  });

  it("covers the complete memo CRUD contract and field mutations", async () => {
    const created = await json(
      await fetchApp("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "complete CRUD #alpha",
          visibility: "private",
          source: "compat-fixture",
          payload: { tags: ["alpha"], client_id: "fixture-client" },
        }),
      }),
      201,
    );

    const fetched = await json(
      await fetchApp(`http://flaremo.test/api/v1/${created.name}`),
    );
    expect(fetched).toEqual(created);

    const updated = await json(
      await fetchApp(`http://flaremo.test/api/v1/${created.name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "updated CRUD #beta",
          visibility: "protected",
          status: "archived",
          pinned: true,
          payload: { tags: ["beta"], client_id: "updated-client" },
        }),
      }),
    );
    expect(updated).toMatchObject({
      name: created.name,
      id: created.id,
      content: "updated CRUD #beta",
      visibility: "protected",
      state: "archived",
      pinned: true,
      creator: created.creator,
      payload: { tags: ["beta"], client_id: "updated-client" },
    });
    expect(Date.parse(updated.update_time)).toBeGreaterThanOrEqual(
      Date.parse(created.update_time),
    );

    const trashed = await json(
      await fetchApp(`http://flaremo.test/api/v1/${created.name}`, {
        method: "DELETE",
      }),
    );
    expect(trashed).toMatchObject({
      name: created.name,
      state: "trashed",
      pinned: true,
    });

    const hardDeleted = await json(
      await fetchApp(`http://flaremo.test/api/v1/${created.name}?hard=true`, {
        method: "DELETE",
      }),
    );
    expect(hardDeleted).toEqual({ ok: true });
    expect(
      (await fetchApp(`http://flaremo.test/api/v1/${created.name}`)).status,
    ).toBe(404);
  });
});
