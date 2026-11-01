import { ValidationError } from "../errors";

export type MemoFilterAst = {
  op: string;
  args: unknown;
};

export const memoFilterStringFields = new Set([
  "content",
  "creator",
  "visibility",
  "state",
]);

export function requireAstArray(
  value: unknown,
  label: string,
): MemoFilterAst[] {
  if (!Array.isArray(value) || !value.every(isAstNode)) {
    rejectUnsupported(`${label} arguments are not valid`);
  }
  return value;
}

export function requireAstArg(
  args: MemoFilterAst[],
  index: number,
  label: string,
): MemoFilterAst {
  const arg = args[index];
  if (!arg) rejectUnsupported(`${label} arguments are not valid`);
  return arg;
}

export function binaryAstArgs(
  node: MemoFilterAst,
): [MemoFilterAst, MemoFilterAst] | undefined {
  if (
    !Array.isArray(node.args) ||
    node.args.length !== 2 ||
    !isAstNode(node.args[0]) ||
    !isAstNode(node.args[1])
  ) {
    return undefined;
  }
  return [node.args[0], node.args[1]];
}

export function callParts(
  node: MemoFilterAst,
): { name: string; args: MemoFilterAst[] } | undefined {
  if (node.op !== "call" || !Array.isArray(node.args)) return undefined;
  const [name, args] = node.args;
  if (
    typeof name !== "string" ||
    !Array.isArray(args) ||
    !args.every(isAstNode)
  ) {
    return undefined;
  }
  return { name, args };
}

export function receiverCallParts(
  node: MemoFilterAst,
):
  | { name: string; receiver: MemoFilterAst; args: MemoFilterAst[] }
  | undefined {
  if (node.op !== "rcall" || !Array.isArray(node.args)) return undefined;
  const [name, receiver, args] = node.args;
  if (
    typeof name !== "string" ||
    !isAstNode(receiver) ||
    !Array.isArray(args) ||
    !args.every(isAstNode)
  ) {
    return undefined;
  }
  return { name, receiver, args };
}

export function isStringOrderingOperand(node: MemoFilterAst) {
  return node.op === "id" && memoFilterStringFields.has(String(node.args));
}

export function stringLiteral(node: MemoFilterAst) {
  return node.op === "value" && typeof node.args === "string"
    ? node.args
    : undefined;
}

export function isIntegerLiteral(node: MemoFilterAst) {
  return (
    node.op === "value" &&
    ((typeof node.args === "number" && Number.isSafeInteger(node.args)) ||
      typeof node.args === "bigint")
  );
}

export function identifierName(node: unknown) {
  return isAstNode(node) && node.op === "id" && typeof node.args === "string"
    ? node.args
    : undefined;
}

export function isStringList(node: MemoFilterAst) {
  return (
    node.op === "list" &&
    Array.isArray(node.args) &&
    node.args.every((item) => isAstNode(item) && typeof item.args === "string")
  );
}

export function countAstNodes(node: { op: string; args: unknown }): number {
  let count = 1;
  const children = Array.isArray(node.args)
    ? node.args
    : node.args && typeof node.args === "object"
      ? Object.values(node.args)
      : [];
  for (const child of children) {
    if (isAstNode(child)) count += countAstNodes(child);
    else if (Array.isArray(child)) {
      for (const nested of child) {
        if (isAstNode(nested)) count += countAstNodes(nested);
      }
    }
  }
  return count;
}

export function isAstNode(value: unknown): value is MemoFilterAst {
  return Boolean(
    value && typeof value === "object" && "op" in value && "args" in value,
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message : "expression is not valid";
}

function rejectUnsupported(message: string): never {
  throw new ValidationError(`Invalid Memos CEL filter: ${message}`);
}
