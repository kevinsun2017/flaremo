import type { FlareMoDb, UserRow } from "@flaremo/db";
import { getFlaremoUserCached } from "../identity-cache";

/**
 * Resolve the creator of a memo for the Memos compatibility DTOs: the viewer
 * already holds the row for their own memos; otherwise it is fetched through
 * the shared per-request identity cache. Both the current REST and Connect
 * surfaces previously carried identical copies.
 */
export async function resolveMemoCreator(
  context: { db: FlareMoDb; user: UserRow | null },
  memo: { userId: string },
): Promise<UserRow> {
  if (context.user?.id === memo.userId) return context.user;
  const creator = await getFlaremoUserCached(context.db, memo.userId);
  if (!creator) throw new Error("Memo creator not found");
  return creator;
}
