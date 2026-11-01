import { getStoredSetting, upsertStoredSetting } from "@flaremo/domain";
import { getAuthUserCached } from "../../../identity-cache";
import {
  type ConnectRequestContext,
  connectSettingRecord,
  requiredString,
} from "../shared";
import { connectErrorForTransport, connectValue } from "../transport";
import {
  assertConnectUserPath,
  assertConnectUserSettingPath,
  type ConnectUserMethodInput,
} from "./shared";

/**
 * The UserService settings surface: `users/{id}/settings/*` reads and writes,
 * backed by the stored-setting rows. The path assertions above keep a session
 * from addressing another user's settings.
 */
export async function connectUserSettingMethod(
  input: ConnectUserMethodInput,
  method: string,
) {
  const { c, context, body, transport } = input;
  switch (method) {
    case "GetUserSetting": {
      assertConnectUserSettingPath(body.name, context.user.id);
      return connectValue(
        c,
        userSettingResponse(context, requiredString(body.name, "name")),
        transport,
      );
    }
    case "ListUserSettings": {
      assertConnectUserPath(body.parent, context.user.id);
      const settings = await listConnectUserSettings(context);
      return connectValue(
        c,
        { settings, totalSize: settings.length },
        transport,
      );
    }
    case "UpdateUserSetting": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to update settings",
          403,
        );
      }
      const setting = connectSettingRecord(body.setting);
      assertConnectUserSettingPath(setting.name, context.user.id);
      const key = userSettingKey(requiredString(setting.name, "setting.name"));
      await upsertStoredSetting(
        context.db,
        context.user,
        `memos.user.${key}`,
        setting.value,
      );
      return connectValue(c, setting, transport);
    }
  }
}

function userSettingKey(name: string) {
  return name.split("/").at(-1) ?? "GENERAL";
}

async function userSettingResponse(
  context: ConnectRequestContext,
  name: string,
) {
  const key = userSettingKey(name);
  const stored = await getStoredSetting(
    context.db,
    context.user,
    `memos.user.${key}`,
  );
  return {
    name,
    value:
      stored?.value && typeof stored.value === "object"
        ? stored.value
        : { case: "generalSetting", value: {} },
  };
}

async function listConnectUserSettings(context: ConnectRequestContext) {
  const username =
    (await getAuthUserCached(context.db, context.authUserId))?.username ??
    "owner";
  const generalName = `${context.user.id}/settings/GENERAL`;
  const stored = await getStoredSetting(
    context.db,
    context.user,
    "memos.user.GENERAL",
  );
  return [
    {
      name: generalName.replace(context.user.id, `users/${username}`),
      value:
        stored?.value && typeof stored.value === "object"
          ? stored.value
          : { case: "generalSetting", value: {} },
    },
  ];
}
