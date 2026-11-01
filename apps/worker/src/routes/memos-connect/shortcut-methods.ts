import {
  createShortcut,
  deleteShortcut,
  getShortcut,
  listShortcuts,
  updateShortcut,
} from "@flaremo/domain";
import {
  currentShortcutsToListResponse,
  currentShortcutToDto,
} from "@flaremo/memos";
import type { getRequestContext } from "../../context";
import { CompatValidationError } from "../../memos-compat/errors";
import type { BinaryTransport } from "../../memos-protobuf";
import {
  type ConnectContext,
  fieldMaskPaths,
  optionalString,
  record,
  requiredString,
} from "./shared";
import { connectErrorForTransport, connectValue } from "./transport";

export async function connectShortcutMethod(
  c: ConnectContext,
  context: Awaited<ReturnType<typeof getRequestContext>>,
  method: string,
  value: unknown,
  transport?: BinaryTransport,
) {
  const body = record(value);
  switch (method) {
    case "ListShortcuts": {
      const parent = requiredString(body.parent, "parent");
      const shortcuts = await listShortcuts(context.db, context.user, parent);
      return connectValue(
        c,
        currentShortcutsToListResponse(shortcuts),
        transport,
      );
    }
    case "GetShortcut":
      return connectValue(
        c,
        currentShortcutToDto(
          await getShortcut(
            context.db,
            context.user,
            requiredString(body.name, "name"),
          ),
        ),
        transport,
      );
    case "CreateShortcut": {
      const shortcut = record(body.shortcut);
      const created = await createShortcut(context.db, context.user, {
        parentName: requiredString(body.parent, "parent"),
        title: optionalString(shortcut.title),
        filter: optionalString(shortcut.filter),
        validateOnly: body.validateOnly === true,
      });
      return connectValue(c, currentShortcutToDto(created), transport);
    }
    case "UpdateShortcut": {
      const shortcut = record(body.shortcut);
      const updateMask = fieldMaskPaths(body.updateMask);
      if (updateMask.length === 0) {
        throw new CompatValidationError("updateMask is required");
      }
      const updated = await updateShortcut(context.db, context.user, {
        name: requiredString(shortcut.name, "shortcut.name"),
        title: optionalString(shortcut.title),
        filter: optionalString(shortcut.filter),
        updateMask,
      });
      return connectValue(c, currentShortcutToDto(updated), transport);
    }
    case "DeleteShortcut":
      await deleteShortcut(context.db, context.user, {
        name: requiredString(body.name, "name"),
      });
      return connectValue(c, {}, transport);
    default:
      return connectErrorForTransport(
        c,
        transport,
        "unimplemented",
        `Shortcut method is not implemented: ${method}`,
        501,
      );
  }
}
