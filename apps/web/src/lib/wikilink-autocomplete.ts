export type ActiveWikiLinkToken = {
  /** Index of the first "[" in the content. */
  start: number;
  /** Text typed after the "[[" (e.g. "my memo"). */
  query: string;
};

/**
 * Detects an open "[[" token preceding the caret for auto-completing memo links.
 * Returns null if no open bracket exists or if the run has already been closed with "]]"
 * or spans across line breaks.
 */
export function extractActiveWikiLinkToken(
  content: string,
  caret: number,
): ActiveWikiLinkToken | null {
  if (caret < 2) return null;
  const preceding = content.slice(0, caret);
  const openBracket = preceding.lastIndexOf("[[");
  if (openBracket < 0) return null;

  const slice = preceding.slice(openBracket);
  if (slice.includes("]]") || slice.includes("\n")) {
    return null;
  }

  const query = slice.slice(2);
  return { start: openBracket, query };
}
