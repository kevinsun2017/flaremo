import { getAuthUserCached } from "../../../identity-cache";
import type { BinaryTransport } from "../../../memos-protobuf";
import {
  type ConnectContext,
  type ConnectRequestContext,
  record,
} from "../shared";
import { connectErrorForTransport } from "../transport";
import { connectUserAccountMethod } from "./accounts";
import { connectUserNotificationMethod } from "./notifications";
import { connectUserSettingMethod } from "./settings";
import type { ConnectUserMethodInput } from "./shared";
import { connectUsersMethod } from "./users";
import { connectUserWebhookMethod } from "./webhooks";

export { createConnectUser } from "./members";

/**
 * UserService dispatch. Each family owns a disjoint set of method names and
 * keeps its own credential checks verbatim, so the first family that recognises
 * the method is the only one that runs; anything unclaimed is unimplemented.
 * The identity row and the body are resolved once, exactly as the unsplit
 * handler did before its switch.
 */
export async function connectUserMethod(
  c: ConnectContext,
  context: ConnectRequestContext,
  method: string,
  value: unknown,
  transport?: BinaryTransport,
) {
  const body = record(value);
  const authUser = await getAuthUserCached(context.db, context.authUserId);
  const input: ConnectUserMethodInput = {
    c,
    context,
    authUser,
    body,
    transport,
  };
  const users = await connectUsersMethod(input, method);
  if (users) return users;
  const settings = await connectUserSettingMethod(input, method);
  if (settings) return settings;
  const accounts = await connectUserAccountMethod(input, method);
  if (accounts) return accounts;
  const webhooks = await connectUserWebhookMethod(input, method);
  if (webhooks) return webhooks;
  const notifications = await connectUserNotificationMethod(input, method);
  if (notifications) return notifications;
  return connectErrorForTransport(
    c,
    transport,
    "unimplemented",
    `User method is not implemented: ${method}`,
    501,
  );
}
