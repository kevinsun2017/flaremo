export type TagSuggestion = { name: string; count: number };

export type ActiveTagToken = {
  /** Index of the leading "#" in the content. */
  start: number;
  /** Text typed after the "#". */
  token: string;
};

const TAG_TOKEN_RE = /^[\p{L}\p{N}_-]*$/u;

/**
 * The in-progress "#tag" the caret sits in, if any.
 *
 * The token is the run of non-whitespace ending at the caret: it must start
 * with "#" (which enforces the preceding character is whitespace or
 * start-of-text, so markdown URLs like `https://a#b` never trigger) and its
 * remainder must match the tag charset shared with `extractTags`.
 */
export function extractActiveTagToken(
  content: string,
  caret: number,
): ActiveTagToken | null {
  let runStart = caret;
  while (runStart > 0 && !/\s/.test(content[runStart - 1] ?? "")) {
    runStart -= 1;
  }
  const run = content.slice(runStart, caret);
  if (!run.startsWith("#")) return null;
  const token = run.slice(1);
  if (!TAG_TOKEN_RE.test(token)) return null;
  return { start: runStart, token };
}

/**
 * Suggestions for the typed token: exact matches first, then prefix matches,
 * then substring matches, each ranked by usage count. An exact match stays in
 * the list — selecting it just commits the tag and moves on. Empty tokens
 * (just typed "#") list the top tags.
 */
export function filterTagSuggestions(
  tags: TagSuggestion[],
  token: string,
  limit = 6,
): TagSuggestion[] {
  const query = token.toLocaleLowerCase();
  const byRank = (a: TagSuggestion, b: TagSuggestion) =>
    b.count - a.count || a.name.localeCompare(b.name);
  const exact: TagSuggestion[] = [];
  const startsWith: TagSuggestion[] = [];
  const includes: TagSuggestion[] = [];
  for (const tag of tags) {
    const name = tag.name.toLocaleLowerCase();
    if (query && name === query) {
      exact.push(tag);
    } else if (query && name.startsWith(query)) {
      startsWith.push(tag);
    } else if (!query || name.includes(query)) {
      includes.push(tag);
    }
  }
  return [...exact, ...startsWith.sort(byRank), ...includes.sort(byRank)].slice(
    0,
    limit,
  );
}
