import {
  createShortcut,
  deleteShortcut,
  getShortcut,
  listShortcuts,
  updateShortcut,
} from "@flaremo/domain";
import { currentShortcutToDto } from "@flaremo/memos";
import type { ReturnTypeOfRequestContext } from "../../../context";
import { type JsonObject, optionalString } from "../../../mcp-protocol";
import {
  firstDefined,
  mergedResourceInput,
  optionalBoolean,
  requiredString,
  resourceName,
} from "../input";

export async function streamableListShortcuts(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const parentName = optionalString(args, "parent", "user") ?? context.user.id;
  const shortcuts = await listShortcuts(context.db, context.user, {
    parentName,
  });
  return { shortcuts: shortcuts.map(currentShortcutToDto) };
}

export async function streamableCreateShortcut(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const input = mergedResourceInput(args, "shortcut");
  const title = requiredString(input.title, "title");
  const filter = optionalString(input, "filter") ?? "";
  const validateOnly =
    optionalBoolean(args, "validateOnly") ??
    optionalBoolean(args, "validate_only") ??
    false;
  const shortcut = await createShortcut(context.db, context.user, {
    parentName: context.user.id,
    title,
    filter,
    validateOnly,
  });
  return currentShortcutToDto(shortcut);
}

export async function streamableGetShortcut(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const name = resourceName(args, "name", "shortcut");
  return currentShortcutToDto(
    await getShortcut(context.db, context.user, { name }),
  );
}

export async function streamableUpdateShortcut(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const input = mergedResourceInput(args, "shortcut");
  const name = requiredString(firstDefined(args.name, input.name), "name");
  const title = optionalString(input, "title");
  const filter = optionalString(input, "filter");
  const updateMask = optionalString(args, "updateMask", "update_mask");
  const shortcut = await updateShortcut(context.db, context.user, {
    name,
    ...(title !== undefined ? { title } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(updateMask !== undefined ? { updateMask } : {}),
  });
  return currentShortcutToDto(shortcut);
}

export async function streamableDeleteShortcut(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  await deleteShortcut(context.db, context.user, {
    name: resourceName(args, "name", "shortcut"),
  });
  return { ok: true };
}
