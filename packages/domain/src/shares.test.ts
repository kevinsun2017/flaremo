import type { UserRow } from "@flaremo/db";
import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "./errors";
import { createMemo } from "./memos";
import {
  createMemoShare,
  getPublicShareByToken,
  listMemoShares,
  revokeMemoShare,
} from "./shares";
import { createTeamMember, ensureTeamOwner } from "./test-support";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let user: UserRow;

describe("memo shares", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-shares-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
    user = await ensureTeamOwner(db);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("requires edit permission to create or list shares", async () => {
    // A public memo is readable by everyone but still not editable by a
    // non-owner, so the share path must refuse them.
    const memo = await createMemo(db, user, {
      content: "公开笔记",
      visibility: "public",
      source: "web",
    });
    const outsider = await createTeamMember(db, "Outsider");
    await expect(createMemoShare(db, outsider, memo.id)).rejects.toThrow(
      "permission",
    );
    await expect(listMemoShares(db, outsider, memo.id)).rejects.toThrow(
      "permission",
    );
  });

  it("reuses the live share for the same memo and expiry", async () => {
    const memo = await createMemo(db, user, {
      content: "要分享的笔记",
      visibility: "private",
      source: "web",
    });
    const first = await createMemoShare(db, user, memo.id);
    const again = await createMemoShare(db, user, memo.id);
    expect(again.token).toBe(first.token);
  });

  it("lets the public read a live share but never a revoked one", async () => {
    const memo = await createMemo(db, user, {
      content: "公开页会读到的笔记",
      visibility: "private",
      source: "web",
    });
    const share = await createMemoShare(db, user, memo.id);
    const publicView = await getPublicShareByToken(db, share.token);
    expect(publicView.memo.id).toBe(memo.id);
    expect(publicView.user.id).toBe(user.id);

    const rows = await listMemoShares(db, user, memo.id);
    expect(rows).toHaveLength(1);
    const live = rows[0];
    if (!live) throw new Error("expected a live share row");
    await revokeMemoShare(db, user, live.id);
    await expect(getPublicShareByToken(db, share.token)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("hides expired shares from the public reader", async () => {
    const memo = await createMemo(db, user, {
      content: "过期的分享",
      visibility: "private",
      source: "web",
    });
    // Create with a live expiry, then age it directly (the create path
    // refuses past expiries).
    const share = await createMemoShare(db, user, memo.id, {
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    const past = new Date(Date.now() - 1000).toISOString();
    await db
      .update((await import("@flaremo/db")).shares)
      .set({ expiresAt: past })
      .where(eq((await import("@flaremo/db")).shares.id, share.id));
    await expect(getPublicShareByToken(db, share.token)).rejects.toThrow(
      NotFoundError,
    );
  });
});
