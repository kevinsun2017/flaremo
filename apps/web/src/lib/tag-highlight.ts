/**
 * Inline `#tag` detection for the composer's WYSIWYG layer. The composer body
 * is rich text; tags stay plain markdown text in storage, so highlighting is a
 * render-only concern: these ranges feed an inline decoration, never the
 * document model, which keeps the markdown round-trip lossless.
 */

const TAG_PATTERN = /(^|[\s(（[>「])#([\p{L}\p{N}_-]+)/gu;

/**
 * Ranges of `#tag` occurrences (including the `#`) inside one line of text.
 * Tags must be preceded by line start, whitespace, or an opening bracket, so
 * `#12` in `v1.2#12` or a URL fragment never lights up.
 */
export function findTagRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of text.matchAll(TAG_PATTERN)) {
    const hashIndex = match.index + match[1].length;
    ranges.push([hashIndex, match.index + match[0].length]);
  }
  return ranges;
}
