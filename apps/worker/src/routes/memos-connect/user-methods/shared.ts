import type { getAuthUserCached } from "../../../identity-cache";
import { CompatValidationError } from "../../../memos-compat/errors";
import type { BinaryTransport } from "../../../memos-protobuf";
import {
  type ConnectContext,
  type ConnectRequestContext,
  requiredString,
} from "../shared";

export type ConnectUserAuthUser = Awaited<ReturnType<typeof getAuthUserCached>>;

/**
 * Everything a UserService method family needs: the Hono context, the resolved
 * request context, the caller's cached Better Auth row, the decoded body and
 * the transport the response must be encoded for. The caller resolves the
 * identity once so every family sees the same row.
 */
export interface ConnectUserMethodInput {
  c: ConnectContext;
  context: ConnectRequestContext;
  authUser: ConnectUserAuthUser;
  body: Record<string, unknown>;
  transport?: BinaryTransport;
}

/**
 * Connect resource names are client supplied, so each family re-checks the path
 * it was handed before touching a row: a caller may only address the current
 * FlareMo user's own user, settings and PAT resources.
 */
export function assertConnectUserPath(value: unknown, currentUserId: string) {
  const name = requiredString(value, "user");
  const normalized = name.startsWith("users/") ? name : `users/${name}`;
  if (normalized !== currentUserId) {
    throw new CompatValidationError(
      "Only the current FlareMo user is available",
    );
  }
}

export function assertConnectUserSettingPath(
  value: unknown,
  currentUserId: string,
) {
  const name = requiredString(value, "setting");
  const prefix = `${currentUserId}/settings/`;
  if (!name.startsWith(prefix) || name.slice(prefix.length).includes("/")) {
    throw new CompatValidationError(
      "Only the current FlareMo user settings are available",
    );
  }
}

export function assertConnectPatPath(value: unknown, currentUserId: string) {
  const name = requiredString(value, "name");
  if (!name.startsWith(`${currentUserId}/personalAccessTokens/`)) {
    throw new CompatValidationError(
      "Only the current FlareMo user's PATs are available",
    );
  }
}
