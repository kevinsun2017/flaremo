import {
  type CreateMemoInput,
  createMemoSchema,
  type ListMemosQuery,
  listMemosQuerySchema,
} from "@flaremo/contracts";
import {
  createMemo,
  getMemoById,
  listMemos,
  moveMemoToTrash,
  updateMemo,
  ValidationError,
} from "@flaremo/domain";
import { parseMemosResourceName } from "@flaremo/memos";
import type { ReturnTypeOfRequestContext } from "../../../context";
import type { FlareMoEnv } from "../../../env";
import { type JsonObject, optionalString } from "../../../mcp-protocol";
import { hardDeleteMemoWithAttachments } from "../../../memo-hard-delete";
import {
  assertUnsupportedMemoCollections,
  firstDefined,
  memoMutationFromInput,
  memoPayloadFromInput,
  memoToCurrentMemosDto,
  mergedMemoInput,
  normalizeMemoState,
  normalizeOrderBy,
  normalizeVisibility,
  optionalBoolean,
  pageSize,
  requiredString,
  resourceName,
} from "../input";

export async function streamableListMemos(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const filter = optionalString(args, "filter");

  const query = listMemosQuerySchema.parse({
    page_size: pageSize(args),
    page_token: optionalString(args, "pageToken", "page_token"),
    order_by: normalizeOrderBy(
      optionalString(args, "orderBy") ?? "created_at desc",
    ),
    state: normalizeMemoState(optionalString(args, "state")),
    q: optionalString(args, "q"),
    tag: optionalString(args, "tag"),
    filter,
    include_deleted:
      optionalBoolean(args, "showDeleted") ??
      optionalBoolean(args, "include_deleted") ??
      false,
  }) as ListMemosQuery;
  const result = await listMemos(context.db, context.user, query, {
    celScanLimit: context.memoFilterScanLimit,
  });
  return {
    memos: result.memos.map((memo) =>
      memoToCurrentMemosDto(memo, context.user),
    ),
    ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
  };
}

export async function streamableCreateMemo(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const input = mergedMemoInput(args);
  assertUnsupportedMemoCollections(input);
  const suppliedMemoId = firstDefined(input.memoId, input.memo_id);
  if (suppliedMemoId !== undefined) {
    throw new ValidationError(
      "memoId is not supported by FlareMo's domain service; omit it so the server can generate the resource name.",
    );
  }

  const createInput = createMemoSchema.parse({
    content: requiredString(input.content, "content"),
    visibility: normalizeVisibility(input.visibility),
    payload: memoPayloadFromInput(input),
    source: optionalString(input, "source") ?? "mcp",
  }) as CreateMemoInput;
  let memo = await createMemo(context.db, context.user, createInput, {
    userLimits: context.userLimits,
    userId: context.user.id,
  });

  const followUp: Parameters<typeof updateMemo>[3] = {};
  const state = normalizeMemoState(
    firstDefined(input.state, input.status) as string | undefined,
  );
  if (state !== undefined) followUp.status = state;
  const pinned = optionalBoolean(input, "pinned");
  if (pinned !== undefined) followUp.pinned = pinned;
  if (Object.keys(followUp).length > 0) {
    memo = await updateMemo(context.db, context.user, memo.id, followUp);
  }
  return memoToCurrentMemosDto(memo, context.user);
}

export async function streamableGetMemo(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const name = resourceName(args, "memo", "name");
  const memo = await getMemoById(
    context.db,
    context.user,
    parseMemosResourceName(name),
  );
  return memoToCurrentMemosDto(memo, context.user);
}

export async function streamableUpdateMemo(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const input = mergedMemoInput(args);
  assertUnsupportedMemoCollections(input);
  const name = resourceName(args, "memo", "name", input);
  const updateMask = optionalString(args, "updateMask", "update_mask");
  const mutation = memoMutationFromInput(input, {
    updateMask,
    allowEmpty: false,
  });
  const memo = await updateMemo(
    context.db,
    context.user,
    parseMemosResourceName(name),
    mutation,
  );
  return memoToCurrentMemosDto(memo, context.user);
}

export async function streamableDeleteMemo(
  context: ReturnTypeOfRequestContext,
  env: FlareMoEnv,
  args: JsonObject,
) {
  const name = resourceName(args, "memo", "name");
  const id = parseMemosResourceName(name);
  const force =
    optionalBoolean(args, "force") ?? optionalBoolean(args, "hard") ?? false;
  if (!force) {
    await moveMemoToTrash(context.db, context.user, id);
    return { ok: true };
  }

  await hardDeleteMemoWithAttachments(env, context.db, context.user, id);
  return { ok: true };
}
