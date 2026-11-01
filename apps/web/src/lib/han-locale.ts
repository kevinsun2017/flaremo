/**
 * Whether a locale renders with Han glyphs.
 *
 * Used by the share-card renderer to drop plugin-supplied letter-spacing:
 * the app-wide `:lang(zh/ja/ko)` tracking reset lives in a stylesheet, but
 * card styles arrive as *inline* declarations, which outrank every stylesheet
 * rule — so the decision has to be made in JS or a plugin can spread/pinch
 * ideographs (and bake it into the exported PNG).
 *
 * Matches the `:lang(zh), :lang(ja), :lang(ko)` selector list in index.css,
 * including its RFC 4647 prefix behaviour (so `zh-CN` and `zh-Hant` match).
 */
const HAN_LOCALE = /^(zh|ja|ko)\b/i;

export function isHanLocale(locale: string | null | undefined): boolean {
  return typeof locale === "string" && HAN_LOCALE.test(locale.trim());
}
