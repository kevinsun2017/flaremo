import type { FlareMoDb, MemoRow, UserRow } from "@flaremo/db";
import { listAttachmentsForMemos } from "@flaremo/domain";
import { memosToListResponse, parseMemosResourceName } from "@flaremo/memos";

export function normalizeGitHubRepository(value: string): string | null {
  const repository = value.trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? repository
    : null;
}

export async function serializeMemosWithAttachments(
  db: FlareMoDb,
  user: UserRow,
  rows: MemoRow[],
) {
  if (rows.length === 0) return [];
  const attachments = await listAttachmentsForMemos(
    db,
    user,
    rows.map((row) => row.id),
  );
  const attachmentsByMemo = new Map<string, (typeof attachments)[number][]>();
  for (const attachment of attachments) {
    if (!attachment.memoId) continue;
    const current = attachmentsByMemo.get(attachment.memoId) ?? [];
    current.push(attachment);
    attachmentsByMemo.set(attachment.memoId, current);
  }
  return memosToListResponse({ memos: rows, attachmentsByMemo, user }).memos;
}

export function parseExcludeParam(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 500)
    .map((entry) => parseMemosResourceName(entry));
}
