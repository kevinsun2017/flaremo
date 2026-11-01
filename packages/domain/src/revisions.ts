import type { FlareMoDb, MemoRow, UserRow } from "@flaremo/db";
import { memoRevisions } from "@flaremo/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { ForbiddenError, NotFoundError } from "./errors";
import { parseResourceName } from "./ids";
import { getMemoById } from "./memos-read";
import { updateMemo } from "./memos-write";
import { canGovernMemo } from "./team-permissions";

/**
 * Reading revision history is a governance read (docs/content-authority.md
 * D2): administrators and the owner may audit what a memo previously said,
 * while restoring an old revision stays author-only via updateMemo's
 * canEditMemo gate.
 */
function assertCanReadRevisions(user: UserRow, memo: MemoRow): void {
  if (!canGovernMemo(user, memo)) {
    throw new ForbiddenError(
      "You do not have permission to read this memo's revisions.",
    );
  }
}

export async function listMemoRevisions(
  db: FlareMoDb,
  user: UserRow,
  memoId: string,
  limit = 50,
) {
  const normalizedMemoId = parseResourceName(memoId, "memos");
  const memo = await getMemoById(db, user, normalizedMemoId, {
    includeDeleted: true,
  });
  assertCanReadRevisions(user, memo);
  const rows = await db
    .select()
    .from(memoRevisions)
    .where(eq(memoRevisions.memoId, normalizedMemoId))
    .orderBy(desc(memoRevisions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return memo.userId === user.id
    ? rows
    : rows.filter((revision) => revision.visibility !== "private");
}

export async function getMemoRevision(
  db: FlareMoDb,
  user: UserRow,
  revisionId: string,
) {
  const id = parseResourceName(revisionId, "revisions");
  const revision = await db
    .select()
    .from(memoRevisions)
    .where(eq(memoRevisions.id, id))
    .get();
  if (!revision) throw new NotFoundError("Memo revision not found");
  const memo = await getMemoById(db, user, revision.memoId, {
    includeDeleted: true,
  });
  assertCanReadRevisions(user, memo);
  if (memo.userId !== user.id && revision.visibility === "private") {
    throw new NotFoundError("Memo revision not found");
  }
  return revision;
}

export async function restoreMemoRevision(
  db: FlareMoDb,
  user: UserRow,
  memoId: string,
  revisionId: string,
) {
  const normalizedMemoId = parseResourceName(memoId, "memos");
  const revision = await getMemoRevision(db, user, revisionId);
  if (revision.memoId !== normalizedMemoId) {
    throw new NotFoundError("Memo revision not found");
  }
  // Restore is a content restore: the memo keeps its current visibility so
  // "roll back to yesterday's text" can never silently republish a private
  // memo (or re-privatize a team one). Payload follows the content.
  return updateMemo(db, user, normalizedMemoId, {
    content: revision.content,
    payload: revision.payload,
  });
}

/**
 * Keep at most MAX_MEMO_REVISIONS_PER_MEMO revisions per memo, deleting the
 * oldest ones beyond the cap. Called right after inserting a new revision so
 * growth stays bounded (revision rows are full content snapshots).
 */
export async function pruneMemoRevisions(db: FlareMoDb, memoId: string) {
  const cutoff = await db
    .select({ createdAt: memoRevisions.createdAt })
    .from(memoRevisions)
    .where(eq(memoRevisions.memoId, memoId))
    .orderBy(desc(memoRevisions.createdAt))
    .offset(MAX_MEMO_REVISIONS_PER_MEMO - 1)
    .limit(1);
  const cutoffAt = cutoff[0]?.createdAt;
  if (!cutoffAt) return;
  await db
    .delete(memoRevisions)
    .where(
      and(
        eq(memoRevisions.memoId, memoId),
        lt(memoRevisions.createdAt, cutoffAt),
      ),
    );
}

export const MAX_MEMO_REVISIONS_PER_MEMO = 50;
