import { ValidationError } from "../errors";
import {
  findClosingDelimiter,
  findQualifiedCall,
  findStringLiteralEnd,
  findTagInList,
  isStringDelimiter,
} from "./scanner";

export function normalizeMemoFilterExpression(expression: string) {
  let normalized = rewriteOutsideStringLiterals(expression, (code) =>
    code
      .replace(
        /\bsets\s*\.\s*(contains|intersects|equivalent)\s*\(/g,
        (_, name: string) => `flaremo_sets_${name}(`,
      )
      .replace(
        /\.\s*(contains|startsWith|endsWith|matches)\s*(?=\()/g,
        (_, name: string) => `.flaremo_${name}`,
      ),
  );

  normalized = rewriteTagsAll(normalized);
  normalized = rewriteTagAliasIn(normalized);
  return normalized;
}

export function rejectReservedImplementationNames(expression: string) {
  let found = false;
  rewriteOutsideStringLiterals(expression, (code) => {
    if (
      /\bflaremo_(?:sets_(?:contains|intersects|equivalent)|tag_in|(?:contains|startsWith|endsWith|matches))\b/.test(
        code,
      )
    ) {
      found = true;
    }
    return code;
  });
  if (found) {
    rejectUnsupported("reserved implementation helper is not public");
  }
}

function rewriteTagsAll(expression: string) {
  let output = "";
  let cursor = 0;
  while (cursor < expression.length) {
    const match = findQualifiedCall(expression, "tags", "all", cursor);
    if (!match) {
      output += expression.slice(cursor);
      break;
    }

    const end = findClosingDelimiter(expression, match.opening);
    if (end < 0) {
      output += expression.slice(cursor);
      break;
    }

    output += expression.slice(cursor, match.start);
    // CEL's all() is vacuously true over an empty list; keep the standard
    // semantics so negated filters (`!tags.all(...)`) agree with upstream.
    const call = expression.slice(match.start, end + 1);
    output += call;
    cursor = end + 1;
  }
  return output;
}

function rewriteTagAliasIn(expression: string) {
  let output = "";
  let cursor = 0;
  while (cursor < expression.length) {
    const match = findTagInList(expression, cursor);
    if (!match) {
      output += expression.slice(cursor);
      break;
    }

    output += expression.slice(cursor, match.start);
    output += `flaremo_tag_in(tags,${expression.slice(match.listStart, match.end + 1)})`;
    cursor = match.end + 1;
  }
  return output;
}

function rewriteOutsideStringLiterals(
  input: string,
  rewrite: (code: string) => string,
) {
  let output = "";
  let segmentStart = 0;
  let index = 0;

  while (index < input.length) {
    if (!isStringDelimiter(input[index])) {
      index += 1;
      continue;
    }

    output += rewrite(input.slice(segmentStart, index));
    const end = findStringLiteralEnd(input, index);
    if (end < 0) {
      output += input.slice(index);
      return output;
    }
    output += input.slice(index, end);
    index = end;
    segmentStart = end;
  }

  return output + rewrite(input.slice(segmentStart));
}

function rejectUnsupported(message: string): never {
  throw new ValidationError(`Invalid Memos CEL filter: ${message}`);
}
