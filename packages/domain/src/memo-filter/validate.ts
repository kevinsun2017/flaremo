import { ValidationError } from "../errors";
import {
  binaryAstArgs,
  callParts,
  identifierName,
  isAstNode,
  isIntegerLiteral,
  isStringList,
  isStringOrderingOperand,
  type MemoFilterAst,
  memoFilterStringFields,
  receiverCallParts,
  requireAstArg,
  requireAstArray,
  stringLiteral,
} from "./ast-utils";
import { validateRegexPattern } from "./regex";

const memoFilterBooleanFields = new Set([
  "pinned",
  "has_link",
  "has_task_list",
  "has_code",
  "has_incomplete_tasks",
]);
const memoFilterAllowedIds = new Set([
  ...memoFilterBooleanFields,
  ...memoFilterStringFields,
  "creator_id",
  "created_ts",
  "updated_ts",
  "tags",
  "now",
]);

function rejectUnsupported(message: string): never {
  throw new ValidationError(`Invalid Memos CEL filter: ${message}`);
}

export function validateMemoFilterSurface(node: MemoFilterAst) {
  visitMemoFilterAst(node, new Set<string>());
}

export function validateAttachmentFilterSurface(node: MemoFilterAst) {
  visitAttachmentFilterAst(node, new Set<string>());
}

function visitAttachmentFilterAst(node: MemoFilterAst, boundIds: Set<string>) {
  switch (node.op) {
    case "id": {
      const name = identifierName(node);
      if (
        !name ||
        (!new Set([
          "filename",
          "mime_type",
          "create_time",
          "memo_id",
          "memo",
          "now",
        ]).has(name) &&
          !boundIds.has(name))
      ) {
        rejectUnsupported("identifier is not supported for attachments");
      }
      return;
    }
    case "value":
      return;
    case "list":
      for (const item of requireAstArray(node.args, "list")) {
        visitAttachmentFilterAst(item, boundIds);
      }
      return;
    case "&&":
    case "||":
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "@in":
    case "in": {
      const args = binaryAstArgs(node);
      if (!args) rejectUnsupported(`${node.op} requires two operands`);
      visitAttachmentFilterAst(args[0], boundIds);
      visitAttachmentFilterAst(args[1], boundIds);
      return;
    }
    case "+":
    case "-":
    case "*":
    case "/":
    case "%": {
      const args = binaryAstArgs(node);
      if (!args) rejectUnsupported(`${node.op} requires two operands`);
      visitAttachmentFilterAst(args[0], boundIds);
      visitAttachmentFilterAst(args[1], boundIds);
      return;
    }
    case "!_":
      if (!isAstNode(node.args))
        rejectUnsupported("NOT requires one condition");
      visitAttachmentFilterAst(node.args, boundIds);
      return;
    case "call": {
      const parts = callParts(node);
      if (!parts) rejectUnsupported("malformed function call");
      if (parts.name === "timestamp" || parts.name === "duration") {
        if (parts.args.length !== 1) {
          rejectUnsupported(`${parts.name} requires one literal`);
        }
        const literal = requireAstArg(parts.args, 0, parts.name);
        if (parts.name === "timestamp") {
          const stringValue = stringLiteral(literal);
          if (stringValue !== undefined) validateTimestampLiteral(stringValue);
          else if (!isIntegerLiteral(literal)) {
            rejectUnsupported(
              "timestamp requires an RFC3339 string or epoch integer",
            );
          }
        } else {
          const stringValue = stringLiteral(literal);
          if (stringValue === undefined) {
            rejectUnsupported("duration requires a literal string");
          }
          validateDurationLiteral(stringValue);
        }
        return;
      }
      return rejectUnsupported(`function ${parts.name} is not supported`);
    }
    case "rcall": {
      const parts = receiverCallParts(node);
      if (!parts) rejectUnsupported("malformed receiver call");
      const receiverName = identifierName(parts.receiver);
      if (
        ![
          "filename",
          "mime_type",
          ...(boundIds.has(receiverName ?? "") ? [receiverName as string] : []),
        ].includes(receiverName ?? "")
      ) {
        if (!memoFilterTimestampMethods.has(parts.name)) {
          rejectUnsupported("attachment method receiver is not supported");
        }
      }
      if (memoFilterTimestampMethods.has(parts.name)) {
        if (receiverName !== "create_time" || parts.args.length !== 0) {
          rejectUnsupported(
            `${parts.name} is only supported on create_time without arguments`,
          );
        }
        visitAttachmentFilterAst(parts.receiver, boundIds);
        return;
      }
      if (
        ![
          "flaremo_contains",
          "flaremo_startsWith",
          "flaremo_endsWith",
          "flaremo_matches",
        ].includes(parts.name)
      ) {
        rejectUnsupported(`method ${parts.name} is not supported`);
      }
      if (parts.args.length !== 1) {
        rejectUnsupported(`${parts.name} requires one string literal`);
      }
      const literal = stringLiteral(requireAstArg(parts.args, 0, parts.name));
      if (literal === undefined) {
        rejectUnsupported(`${parts.name} requires a literal string`);
      }
      if (parts.name === "flaremo_matches") validateRegexPattern(literal);
      if (receiverName !== "filename" && receiverName !== "mime_type") {
        rejectUnsupported("text methods only support attachment text fields");
      }
      visitAttachmentFilterAst(parts.receiver, boundIds);
      return;
    }
    default:
      rejectUnsupported(`operator ${node.op} is not supported`);
  }
}

function visitMemoFilterAst(node: MemoFilterAst, boundIds: Set<string>) {
  switch (node.op) {
    case "id": {
      const name = identifierName(node);
      if (!name || (!memoFilterAllowedIds.has(name) && !boundIds.has(name))) {
        rejectUnsupported("identifier is not supported");
      }
      return;
    }
    case "value":
      return;
    case "list":
      for (const item of requireAstArray(node.args, "list")) {
        visitMemoFilterAst(item, boundIds);
      }
      return;
    case "&&":
    case "||":
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=": {
      const args = binaryAstArgs(node);
      if (!args) rejectUnsupported(`${node.op} requires two operands`);
      if (
        ["<", "<=", ">", ">="].includes(node.op) &&
        isStringOrderingOperand(args[0])
      ) {
        rejectUnsupported("string ordering is not supported");
      }
      visitMemoFilterAst(args[0], boundIds);
      visitMemoFilterAst(args[1], boundIds);
      return;
    }
    case "+":
    case "-":
    case "*":
    case "/":
    case "%": {
      const args = binaryAstArgs(node);
      if (!args) rejectUnsupported(`${node.op} requires two operands`);
      visitMemoFilterAst(args[0], boundIds);
      visitMemoFilterAst(args[1], boundIds);
      return;
    }
    case "!_":
      if (!isAstNode(node.args))
        rejectUnsupported("NOT requires one condition");
      visitMemoFilterAst(node.args, boundIds);
      return;
    case "call":
      validateCallSurface(node, boundIds);
      return;
    case "rcall":
      validateReceiverCallSurface(node, boundIds);
      return;
    default:
      rejectUnsupported(`operator ${node.op} is not supported`);
  }
}

function validateCallSurface(node: MemoFilterAst, boundIds: Set<string>) {
  const parts = callParts(node);
  if (!parts) rejectUnsupported("malformed function call");

  if (
    parts.name === "flaremo_tag_in" ||
    parts.name === "flaremo_sets_contains" ||
    parts.name === "flaremo_sets_intersects" ||
    parts.name === "flaremo_sets_equivalent"
  ) {
    if (parts.args.length !== 2) {
      rejectUnsupported(`${parts.name} requires tags and a string list`);
    }
    const receiver = requireAstArg(parts.args, 0, parts.name);
    const candidates = requireAstArg(parts.args, 1, parts.name);
    if (identifierName(receiver) !== "tags" || !isStringList(candidates)) {
      rejectUnsupported(`${parts.name} requires tags and a string list`);
    }
    visitMemoFilterAst(receiver, boundIds);
    return;
  }

  if (parts.name === "size") {
    if (parts.args.length !== 1) {
      rejectUnsupported("size requires one argument");
    }
    const receiver = requireAstArg(parts.args, 0, "size");
    if (!new Set(["content", "tags"]).has(identifierName(receiver) ?? "")) {
      rejectUnsupported("size is only supported for content and tags");
    }
    visitMemoFilterAst(receiver, boundIds);
    return;
  }

  if (parts.name === "timestamp" || parts.name === "duration") {
    if (parts.args.length !== 1) {
      rejectUnsupported(`${parts.name} requires one literal`);
    }
    const literal = requireAstArg(parts.args, 0, parts.name);
    if (parts.name === "timestamp") {
      const stringValue = stringLiteral(literal);
      if (stringValue !== undefined) {
        validateTimestampLiteral(stringValue);
      } else if (!isIntegerLiteral(literal)) {
        rejectUnsupported(
          "timestamp requires an RFC3339 string or epoch integer",
        );
      }
    } else {
      const stringValue = stringLiteral(literal);
      if (stringValue === undefined) {
        rejectUnsupported("duration requires a literal string");
      }
      validateDurationLiteral(stringValue);
    }
    return;
  }

  rejectUnsupported(`function ${parts.name} is not supported`);
}

function validateReceiverCallSurface(
  node: MemoFilterAst,
  boundIds: Set<string>,
) {
  const parts = receiverCallParts(node);
  if (!parts) rejectUnsupported("malformed receiver call");

  if (
    parts.name === "exists" ||
    parts.name === "all" ||
    parts.name === "exists_one"
  ) {
    if (parts.args.length !== 2) {
      rejectUnsupported(`${parts.name} is only supported for tags`);
    }
    const iteratorArg = requireAstArg(parts.args, 0, parts.name);
    const predicate = requireAstArg(parts.args, 1, parts.name);
    if (
      identifierName(parts.receiver) !== "tags" ||
      identifierName(iteratorArg) === undefined
    ) {
      rejectUnsupported(`${parts.name} is only supported for tags`);
    }
    const iterator = identifierName(iteratorArg);
    if (!iterator || iterator === "tag") {
      rejectUnsupported("tag comprehension iterator is not valid");
    }
    visitMemoFilterAst(parts.receiver, boundIds);
    const nestedIds = new Set(boundIds);
    nestedIds.add(iterator);
    visitMemoFilterAst(predicate, nestedIds);
    return;
  }

  const receiverName = identifierName(parts.receiver);
  if (parts.name === "size") {
    if (parts.args.length !== 0) {
      rejectUnsupported("size requires no arguments when used as a method");
    }
    if (receiverName !== "content" && receiverName !== "tags") {
      rejectUnsupported("size is only supported for content and tags");
    }
    visitMemoFilterAst(parts.receiver, boundIds);
    return;
  }

  if (memoFilterTimestampMethods.has(parts.name)) {
    if (receiverName !== "created_ts" && receiverName !== "updated_ts") {
      rejectUnsupported(`${parts.name} is only supported for timestamp fields`);
    }
    if (parts.args.length !== 0) {
      rejectUnsupported(`${parts.name} does not accept a timezone argument`);
    }
    visitMemoFilterAst(parts.receiver, boundIds);
    return;
  }

  if (
    parts.name !== "flaremo_contains" &&
    parts.name !== "flaremo_startsWith" &&
    parts.name !== "flaremo_endsWith" &&
    parts.name !== "flaremo_matches"
  ) {
    rejectUnsupported(`method ${parts.name} is not supported`);
  }
  if (receiverName !== "content" && !boundIds.has(receiverName ?? "")) {
    rejectUnsupported("text methods only support content and tag iterators");
  }
  if (parts.args.length !== 1) {
    rejectUnsupported(`${parts.name} requires one string literal`);
  }
  const literal = stringLiteral(requireAstArg(parts.args, 0, parts.name));
  if (literal === undefined) {
    rejectUnsupported(`${parts.name} requires a literal string`);
  }
  if (parts.name === "flaremo_matches") validateRegexPattern(literal);
  visitMemoFilterAst(parts.receiver, boundIds);
}

const memoFilterTimestampMethods = new Set([
  "getDate",
  "getDayOfMonth",
  "getDayOfWeek",
  "getDayOfYear",
  "getFullYear",
  "getHours",
  "getMinutes",
  "getMonth",
  "getSeconds",
]);

function validateTimestampLiteral(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    Number.isNaN(Date.parse(value))
  ) {
    rejectUnsupported("timestamp requires a valid RFC3339 literal");
  }
}

function validateDurationLiteral(value: string) {
  if (
    !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:ns|us|µs|ms|s|m|h)(?:(?:\d+(?:\.\d+)?|\.\d+)(?:ns|us|µs|ms|s|m|h))*$/.test(
      value,
    )
  ) {
    rejectUnsupported("duration requires a valid literal");
  }
}
