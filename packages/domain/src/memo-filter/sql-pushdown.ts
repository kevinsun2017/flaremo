import { memos } from "@flaremo/db";
import type { SQL } from "drizzle-orm";
import { and, eq, or, sql } from "drizzle-orm";
import { binaryAstArgs, isAstNode } from "./ast-utils";

/**
 * Exact translation; identical comparison semantics in SQL and the CEL
 * evaluator (state/visibility compare upper-cased on both sides, pinned is a
 * boolean on both sides), verified in memoFilterContext and
 * memoFilterSqlPredicate.
 */
export function memoFilterSqlIsComplete(value: unknown): boolean {
  if (!isAstNode(value)) return false;
  if (value.op === "&&") {
    return (binaryAstArgs(value) ?? []).every((side) =>
      memoFilterSqlIsComplete(side),
    );
  }
  if (value.op === "||") {
    const operands = binaryAstArgs(value) ?? [];
    return (
      operands.length === 2 &&
      operands.every(
        (side) =>
          memoFilterSqlIsComplete(side) &&
          memoFilterSqlPredicate(side) !== undefined,
      )
    );
  }
  return value.op === "==" && memoFilterSqlPredicate(value) !== undefined;
}

/** Only push down necessary conditions; the CEL evaluator remains authoritative. */
export function memoFilterSqlPredicate(value: unknown): SQL | undefined {
  if (!isAstNode(value)) return undefined;
  if (value.op === "&&" || value.op === "||") {
    const operands = binaryAstArgs(value);
    if (!operands) return undefined;
    const left = memoFilterSqlPredicate(operands[0]);
    const right = memoFilterSqlPredicate(operands[1]);
    // A partially translated OR would wrongly exclude valid matches.
    return value.op === "&&"
      ? and(left, right)
      : left && right
        ? or(left, right)
        : undefined;
  }
  if (value.op === "id" && value.args === "pinned") {
    return eq(memos.pinned, true);
  }
  if (value.op !== "==") return undefined;
  const operands = binaryAstArgs(value);
  if (!operands) return undefined;
  const [field, literal] =
    operands[0].op === "id" ? operands : [operands[1], operands[0]];
  if (field.op !== "id" || literal.op !== "value") return undefined;
  if (field.args === "pinned" && typeof literal.args === "boolean") {
    return eq(memos.pinned, literal.args);
  }
  if (typeof literal.args !== "string") return undefined;
  if (field.args === "state") {
    return eq(sql`upper(${memos.status})`, literal.args);
  }
  if (field.args === "visibility") {
    return eq(sql`upper(${memos.visibility})`, literal.args);
  }
  return undefined;
}
