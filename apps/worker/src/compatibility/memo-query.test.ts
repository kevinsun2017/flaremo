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

describe("Memos-compatible memo queries", () => {
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

  it("combines state, visibility, pinned, tag, pagination, and ordering", async () => {
    const normalAlpha = await createMemoWith({
      content: "normal alpha #alpha",
      visibility: "private",
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const publicAlpha = await createMemoWith({
      content: "public alpha #alpha",
      visibility: "public",
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const archivedBeta = await createMemoWith({
      content: "archived beta #beta",
      visibility: "protected",
    });

    await json(
      await fetchApp(`http://flaremo.test/api/v1/${publicAlpha.name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pinned: true }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
    await json(
      await fetchApp(`http://flaremo.test/api/v1/${archivedBeta.name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "archived",
          content: "archived beta revised #beta",
        }),
      }),
    );

    const alpha = await listMemos("state=normal&tag=alpha");
    expect(alpha.memos.map((memo: { name: string }) => memo.name)).toEqual([
      publicAlpha.name,
      normalAlpha.name,
    ]);
    expect(
      alpha.memos.every(
        (memo: { payload: { tags?: string[] }; state: string }) =>
          memo.state === "normal" && memo.payload.tags?.includes("alpha"),
      ),
    ).toBe(true);

    const archived = await listMemos("state=archived&tag=beta");
    expect(archived.memos).toHaveLength(1);
    expect(archived.memos[0]).toMatchObject({
      name: archivedBeta.name,
      state: "archived",
      visibility: "protected",
      pinned: false,
    });

    for (const orderBy of [
      "created_at asc",
      "created_at desc",
      "updated_at asc",
      "updated_at desc",
    ]) {
      const names: string[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          include_deleted: "true",
          order_by: orderBy,
          page_size: "1",
        });
        if (pageToken) params.set("page_token", pageToken);
        const page = await listMemos(params.toString());
        names.push(...page.memos.map((memo: { name: string }) => memo.name));
        pageToken = page.next_page_token;
      } while (pageToken);

      expect(new Set(names)).toEqual(
        new Set([normalAlpha.name, publicAlpha.name, archivedBeta.name]),
      );
      expect(names[0]).toBe(publicAlpha.name);
    }

    const firstPage = await listMemos(
      "include_deleted=true&page_size=1&order_by=created_at%20asc",
    );
    const mismatchedToken = await fetchApp(
      `http://flaremo.test/api/v1/memos?include_deleted=true&page_size=1&order_by=created_at%20desc&page_token=${encodeURIComponent(firstPage.next_page_token)}`,
    );
    expect(mismatchedToken.status).toBe(400);
  });
});

async function createMemoWith(input: {
  content: string;
  visibility: "private" | "protected" | "public";
}) {
  return json(
    await fetchApp("http://flaremo.test/api/v1/memos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    201,
  );
}

async function listMemos(query: string) {
  return json<{
    memos: Array<Record<string, unknown>>;
    next_page_token?: string;
  }>(await fetchApp(`http://flaremo.test/api/v1/memos?${query}`));
}
