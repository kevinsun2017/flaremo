import {
  beginFlaremoMemberRemoval,
  finalizeFlaremoMemberRemoval,
  getMemoStats,
  isInstanceOwner,
  isTeamAdmin,
  listFlaremoUsers,
  listMemoTotalsByUser,
  updateFlaremoUserProfile,
} from "@flaremo/domain";
import { currentUserToDto } from "@flaremo/memos";
import { cleanupFlaremoArtifacts } from "../../../artifact-cleanup";
import { getAuthUserCached } from "../../../identity-cache";
import { CompatValidationError } from "../../../memos-compat/errors";
import { memosCompatUserDto } from "../../../memos-compat/user-dto";
import {
  fieldMaskPaths,
  getUserByName,
  list,
  optionalString,
  record,
  requiredString,
} from "../shared";
import { connectErrorForTransport, connectValue } from "../transport";
import { createConnectUser, updateBetterAuthUsername } from "./members";
import { assertConnectUserPath, type ConnectUserMethodInput } from "./shared";

/**
 * The UserService methods that are about users themselves: directory queries,
 * the owner-only lifecycle RPCs, per-user stats and the linked-identity stubs.
 * Each case keeps its own credential check exactly where the unsplit handler
 * had it.
 */
export async function connectUsersMethod(
  input: ConnectUserMethodInput,
  method: string,
) {
  const { c, context, authUser, body, transport } = input;
  switch (method) {
    case "ListUsers": {
      const filter = optionalString(body.filter);
      const users = await Promise.all(
        (await listFlaremoUsers(context.db)).map((user) =>
          memosCompatUserDto(context.db, user, context.user.id, authUser),
        ),
      );
      const matched = filter
        ? users.filter((user) => user.username.includes(filter))
        : users;
      return connectValue(
        c,
        { users: matched, totalSize: matched.length },
        transport,
      );
    }
    case "BatchGetUsers": {
      const usernames = list(body.usernames).filter(
        (username): username is string => typeof username === "string",
      );
      const all = await Promise.all(
        (await listFlaremoUsers(context.db)).map((user) =>
          memosCompatUserDto(context.db, user, context.user.id, authUser),
        ),
      );
      const users =
        usernames.length === 0
          ? all
          : all.filter((user) => usernames.includes(user.username));
      return connectValue(c, { users }, transport);
    }
    case "GetUser": {
      const user = await getUserByName(context.db, body.name);
      if (!user) throw new CompatValidationError("User not found");
      const dto = await memosCompatUserDto(
        context.db,
        user,
        context.user.id,
        authUser,
      );
      return connectValue(c, dto, transport);
    }
    case "CreateUser": {
      if (context.credential === "pat" || !isInstanceOwner(context.user)) {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "An owner session is required to create a user",
          403,
        );
      }
      const user = record(body.user);
      const username = requiredString(user.username, "user.username");
      const password = requiredString(user.password, "user.password");
      if (password.length < 8) {
        throw new CompatValidationError(
          "user.password must be at least 8 characters",
        );
      }
      const displayName =
        optionalString(user.displayName) ??
        optionalString(user.nickname) ??
        username;
      const email = `${username}@flaremo.local`;
      const created = await createConnectUser(
        c,
        context.db,
        {
          username,
          password,
          displayName,
          email,
        },
        context.limits,
      );
      return connectValue(c, created.dto, transport);
    }
    case "DeleteUser": {
      if (context.credential === "pat" || !isInstanceOwner(context.user)) {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "An owner session is required to delete a user",
          403,
        );
      }
      const target = await getUserByName(context.db, body.name);
      if (!target) throw new CompatValidationError("User not found");
      if (target.id === context.user.id) {
        throw new CompatValidationError("You cannot delete your own account");
      }
      const artifacts = await beginFlaremoMemberRemoval(context.db, target.id);
      await cleanupFlaremoArtifacts(c.env, artifacts);
      await finalizeFlaremoMemberRemoval(context.db, target.id, artifacts);
      return connectValue(c, {}, transport);
    }
    case "UpdateUser": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to update the user",
          403,
        );
      }
      const user = record(body.user);
      assertConnectUserPath(user.name, context.user.id);
      const fields = fieldMaskPaths(body.updateMask);
      if (fields.length === 0)
        throw new CompatValidationError("updateMask is required");
      let nextAuthUser = authUser;
      if (fields.includes("username")) {
        const username = requiredString(user.username, "user.username");
        await updateBetterAuthUsername(c, context, username);
        nextAuthUser = await getAuthUserCached(context.db, context.authUserId);
      }
      const updatedUser = await updateFlaremoUserProfile(
        context.db,
        context.user,
        {
          ...(fields.includes("displayName")
            ? { name: requiredString(user.displayName, "user.displayName") }
            : {}),
          ...(fields.includes("avatarUrl")
            ? { avatarUrl: optionalString(user.avatarUrl) ?? null }
            : {}),
        },
      );
      return connectValue(
        c,
        currentUserToDto(updatedUser, nextAuthUser),
        transport,
      );
    }
    case "GetUserStats": {
      assertConnectUserPath(body.name, context.user.id);
      const stats = await getMemoStats(context.db, context.user, {
        time_zone: "UTC",
      });
      return connectValue(
        c,
        userStatsFromMemoStats(context.user.id, stats),
        transport,
      );
    }
    case "ListAllUserStats": {
      // Team-wide stats are an administrative view; a member must not be able
      // to profile the whole instance.
      if (!isTeamAdmin(context.user)) {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A team administrator is required to list all user stats",
          403,
        );
      }
      const [users, totals] = await Promise.all([
        listFlaremoUsers(context.db),
        listMemoTotalsByUser(context.db),
      ]);
      const stats = users.map((user) => {
        const entry = totals.get(user.id);
        return {
          name: user.id,
          memoTypeStats: {
            linkCount: 0,
            codeCount: 0,
            todoCount: 0,
            undoCount: 0,
          },
          tagCount: Object.fromEntries(entry?.tags ?? []),
          totalMemoCount: entry?.total ?? 0,
          pinnedMemos: [],
          memoCreatedTimestamps: [],
          memoUpdatedTimestamps: [],
        };
      });
      return connectValue(c, { stats }, transport);
    }
    case "ListLinkedIdentities":
      assertConnectUserPath(body.parent, context.user.id);
      return connectValue(c, { linkedIdentities: [] }, transport);
    case "CreateLinkedIdentity":
    case "GetLinkedIdentity":
    case "DeleteLinkedIdentity":
      return connectErrorForTransport(
        c,
        transport,
        "unimplemented",
        "SSO linked identities are not configured on FlareMo",
        501,
      );
  }
}

function userStatsFromMemoStats(
  userId: string,
  stats: Awaited<ReturnType<typeof getMemoStats>>,
) {
  return {
    name: userId,
    memoTypeStats: { linkCount: 0, codeCount: 0, todoCount: 0, undoCount: 0 },
    tagCount: Object.fromEntries(
      stats.tags.map((tag) => [tag.name, tag.count]),
    ),
    totalMemoCount: stats.counts.total,
    pinnedMemos: [],
    memoCreatedTimestamps: [],
    memoUpdatedTimestamps: [],
  };
}
