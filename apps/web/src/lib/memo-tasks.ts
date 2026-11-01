/**
 * Helpers for GFM task-list lines (`- [ ]` / `- [x]`) inside memo markdown.
 * The memo stays a plain Markdown document; toggling rewrites the one source
 * line so checkboxes work in the read view without a second data model.
 */

// Same shape GFM accepts: a list marker, an optional indent, `[ ]`/`[x]`, and
// at least the closing bracket.
const TASK_LINE_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\](?:\s.*)?)$/;

export type MemoTaskLine = {
  /** 0-based index into `content.split("\n")`. */
  lineIndex: number;
  checked: boolean;
  /** Item text with the marker and checkbox stripped. */
  text: string;
};

export function memoTaskLines(content: string): MemoTaskLine[] {
  return content.split("\n").flatMap((line, lineIndex) => {
    const match = TASK_LINE_RE.exec(line);
    if (!match) return [];
    return [
      {
        checked: match[2] !== " ",
        lineIndex,
        text: match[3].replace(/^\]\s*/, "").trim(),
      },
    ];
  });
}

/**
 * Flips the checkbox on the given source line, returning the rewritten
 * document. Null when the line is not a task item — callers must treat that
 * as "stale index", not as an error to surface.
 */
export function toggleMemoTaskLine(
  content: string,
  lineIndex: number,
): string | null {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (!line) return null;
  const match = TASK_LINE_RE.exec(line);
  if (!match) return null;
  lines[lineIndex] = `${match[1]}${match[2] === " " ? "x" : " "}${match[3]}`;
  return lines.join("\n");
}

export function countTaskItems(content: string): number {
  // TASK_LINE_RE is line-scoped (no `g` flag); count line-wise like memoTaskLines.
  let count = 0;
  for (const line of content.split("\n")) {
    if (TASK_LINE_RE.test(line)) count += 1;
  }
  return count;
}
