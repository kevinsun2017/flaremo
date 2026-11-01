import type { AttachmentRow, MemoRow, UserRow } from "@flaremo/db";
import {
  type listMemoRelations,
  type updateMemo,
  ValidationError,
} from "@flaremo/domain";
import {
  currentAttachmentToDto,
  currentMemoToDto,
  currentUserToDto,
} from "@flaremo/memos";
import type { ReturnTypeOfRequestContext } from "../../context";
import { isJsonObject, type JsonObject } from "../../mcp-protocol";
import { parseMemosOrderBy } from "../../memos-compat/parsing";

export function mergedMemoInput(args: JsonObject): JsonObject {
  const body = args.body;
  const memoArgument = args.memo;
  const memoObject = isJsonObject(memoArgument) ? memoArgument : {};
  if (body !== undefined && !isJsonObject(body)) {
    throw new ValidationError("body must be an object.");
  }
  return {
    ...args,
    ...memoObject,
    ...(isJsonObject(body) ? body : {}),
  };
}

export function mergedResourceInput(
  args: JsonObject,
  ...keys: string[]
): JsonObject {
  const result = { ...args };
  for (const key of keys) {
    const value = args[key];
    if (value === undefined) continue;
    if (!isJsonObject(value)) {
      throw new ValidationError(`${key} must be an object.`);
    }
    Object.assign(result, value);
  }
  return result;
}

export function assertUnsupportedMemoCollections(input: JsonObject) {
  if (input.attachments !== undefined) {
    throw new ValidationError(
      "Memo attachments must be changed with memo_set_memo_attachments.",
    );
  }
  if (input.relations !== undefined) {
    throw new ValidationError(
      "Memo relations must be changed with memo_set_memo_relations.",
    );
  }
}

export function memoPayloadFromInput(input: JsonObject) {
  const payloadValue = input.payload;
  if (payloadValue !== undefined && !isJsonObject(payloadValue)) {
    throw new ValidationError("payload must be an object.");
  }
  const payload: JsonObject = isJsonObject(payloadValue)
    ? { ...payloadValue }
    : {};
  if (input.tags !== undefined) {
    if (
      !Array.isArray(input.tags) ||
      input.tags.some((tag) => typeof tag !== "string")
    ) {
      throw new ValidationError("tags must be an array of strings.");
    }
    payload.tags = input.tags;
  }
  if (input.property !== undefined) {
    if (!isJsonObject(input.property))
      throw new ValidationError("property must be an object.");
    payload.property = input.property;
  }
  if (input.location !== undefined) payload.location = input.location;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function memoMutationFromInput(
  input: JsonObject,
  options: { allowEmpty: boolean; updateMask?: string },
) {
  const updateMask = options.updateMask
    ? normalizeUpdateMask(options.updateMask)
    : undefined;
  const mutation: Record<string, unknown> = {};
  const isFieldRequested = (field: string) => {
    if (!updateMask) return true;
    if (updateMask.has(field)) return true;
    if (field === "status" && updateMask.has("state")) return true;
    if (
      field === "payload" &&
      ["tags", "property", "location"].some((payloadField) =>
        updateMask.has(payloadField),
      )
    ) {
      return true;
    }
    return false;
  };
  const setIfRequested = (field: string, value: unknown) => {
    if (value === undefined) return;
    if (!isFieldRequested(field)) return;
    mutation[field] = value;
  };

  setIfRequested(
    "content",
    input.content === undefined
      ? undefined
      : requiredString(input.content, "content"),
  );
  setIfRequested("visibility", normalizeVisibility(input.visibility, true));
  const state = normalizeMemoState(
    firstDefined(input.state, input.status) as string | undefined,
  );
  setIfRequested("status", state);
  setIfRequested("pinned", optionalBoolean(input, "pinned"));

  const hasPayloadInput =
    input.payload !== undefined ||
    input.tags !== undefined ||
    input.property !== undefined ||
    input.location !== undefined;
  if (hasPayloadInput) {
    setIfRequested("payload", memoPayloadFromInput(input));
  }

  if (updateMask) {
    for (const field of updateMask) {
      if (
        ![
          "content",
          "visibility",
          "status",
          "state",
          "pinned",
          "payload",
          "tags",
          "property",
          "location",
        ].includes(field)
      ) {
        throw new ValidationError(
          `Update field "${field}" is not supported by FlareMo.`,
        );
      }
    }
    if (updateMask.has("state")) {
      if (mutation.status === undefined) {
        throw new ValidationError(
          "updateMask includes state but no state value was provided.",
        );
      }
    }
    if (
      updateMask.has("tags") ||
      updateMask.has("property") ||
      updateMask.has("location")
    ) {
      if (!hasPayloadInput) {
        throw new ValidationError(
          "updateMask includes payload fields but no value was provided.",
        );
      }
    }
  }

  if (!options.allowEmpty && Object.keys(mutation).length === 0) {
    throw new ValidationError(
      "At least one supported memo field must be updated.",
    );
  }
  return mutation as Parameters<typeof updateMemo>[3];
}

function normalizeUpdateMask(value: string) {
  const fields = new Set<string>();
  for (const rawField of value.split(",")) {
    const field = rawField.trim().replace(/^memo\./, "");
    if (field) fields.add(field);
  }
  if (fields.size === 0)
    throw new ValidationError("updateMask must name at least one field.");
  return fields;
}

export function normalizeOrderBy(value: string) {
  const parsed = parseMemosOrderBy(value);
  if (!parsed) {
    throw new ValidationError(
      "orderBy must be one supported single-field order such as create_time desc.",
    );
  }
  return parsed;
}

export function pageSize(args: JsonObject) {
  const raw = firstDefined(args.pageSize, args.page_size);
  if (raw === undefined) return 50;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new ValidationError("pageSize must be an integer.");
  }
  if (raw < 1 || raw > 100) {
    throw new ValidationError("pageSize must be between 1 and 100.");
  }
  return raw;
}

export function resourceName(
  args: JsonObject,
  primary: string,
  secondary: string,
  additional?: JsonObject,
) {
  const value = firstDefined(
    args[primary],
    args[secondary],
    additional?.[primary],
    additional?.[secondary],
  );
  return requiredString(value, primary);
}

export function optionalBoolean(args: JsonObject, name: string) {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean")
    throw new ValidationError(`${name} must be a boolean.`);
  return value;
}

export function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

export function firstDefined<T>(...values: Array<T | undefined>) {
  return values.find((value) => value !== undefined);
}

export function normalizeMemoName(value: string) {
  return value.startsWith("memos/") ? value : `memos/${value}`;
}

export function normalizeVisibility(
  value: unknown,
  optional = false,
): "private" | "protected" | "public" | undefined {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    return "private";
  }
  if (typeof value !== "string")
    throw new ValidationError("visibility must be a string.");
  const normalized = value.toLowerCase();
  if (normalized === "visibility_unspecified")
    return optional ? undefined : "private";
  if (
    normalized === "private" ||
    normalized === "protected" ||
    normalized === "public"
  )
    return normalized;
  throw new ValidationError(`Unsupported visibility "${value}".`);
}

export function normalizeMemoState(value: string | undefined) {
  if (value === undefined || value === "STATE_UNSPECIFIED") return undefined;
  const normalized = value.toLowerCase();
  if (["normal", "archived", "trashed", "deleted"].includes(normalized)) {
    return normalized as "normal" | "archived" | "trashed" | "deleted";
  }
  throw new ValidationError(`Unsupported memo state "${value}".`);
}

export function normalizeRelationType(value: unknown): "reference" | "comment" {
  if (value === undefined || value === null || value === "TYPE_UNSPECIFIED") {
    return "reference" as const;
  }
  if (typeof value !== "string")
    throw new ValidationError("relation type must be a string.");
  const normalized = value.toLowerCase();
  if (normalized === "reference" || normalized === "comment") {
    return normalized as "reference" | "comment";
  }
  throw new ValidationError(`Unsupported relation type "${value}".`);
}

export function memoToCurrentMemosDto(memo: MemoRow, user: UserRow) {
  return currentMemoToDto(memo, user);
}

export function attachmentToCurrentMemosDto(attachment: AttachmentRow) {
  return currentAttachmentToDto(attachment);
}

export function relationToCurrentMemosDto(
  relation: Awaited<ReturnType<typeof listMemoRelations>>[number],
) {
  return {
    memo: { name: relation.memoId },
    relatedMemo: { name: relation.relatedMemoId },
    type: relation.type.toUpperCase(),
    createTime: relation.createdAt,
  };
}

export function currentUserToMemosDto(context: ReturnTypeOfRequestContext) {
  return currentUserToDto(context.user);
}
