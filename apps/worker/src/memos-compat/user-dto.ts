import type { FlareMoDb, UserRow } from "@flaremo/db";
import { getAuthUserIdByFlaremoUserId } from "@flaremo/domain";
import { currentUserToDto, publicUserToDto } from "@flaremo/memos";
import { getAuthUserCached } from "../identity-cache";

type AuthUser = Awaited<ReturnType<typeof getAuthUserCached>>;

/**
 * Build the current-Memos user DTO for a viewer: the viewer's own row keeps
 * the full current shape, everyone else gets the public shape that carries
 * display fields but never the email — the compatibility surface must not
 * become an email directory. The current and Connect surfaces previously
 * carried identical copies of this branch.
 *
 * `selfAuthUser` lets callers reuse an already-resolved Better Auth row for
 * the self case (e.g. a Connect session's cached identity); when omitted the
 * row is resolved through the shared per-request identity cache.
 */
export async function memosCompatUserDto(
  db: FlareMoDb,
  user: UserRow,
  currentUserId: string,
  selfAuthUser?: AuthUser | null,
) {
  if (user.id === currentUserId) {
    const authUser =
      selfAuthUser !== undefined
        ? selfAuthUser
        : await resolveAuthUser(db, user.id);
    return currentUserToDto(user, authUser);
  }
  const authUser = await resolveAuthUser(db, user.id);
  return publicUserToDto(user, authUser?.username ?? undefined);
}

async function resolveAuthUser(db: FlareMoDb, userId: string) {
  const authUserId = await getAuthUserIdByFlaremoUserId(db, userId);
  return authUserId ? await getAuthUserCached(db, authUserId) : null;
}
