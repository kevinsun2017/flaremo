export const NODE_TYPES = new Set([
  "row",
  "column",
  "text",
  "image",
  "svg",
  "divider",
  "spacer",
]);

export const STYLE_KEYS = new Set([
  "background",
  "backgroundCSS",
  "opacity",
  "borderRadius",
  "borderWidth",
  "borderColor",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderStyle",
  "shadow",
  "shadowCSS",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "color",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "width",
  "height",
  "minHeight",
  "flex",
  "align",
  "justify",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "overflow",
  "clamp",
  "rotate",
  "font",
]);

export const FONT_KEYS = new Set([
  "family",
  "size",
  "weight",
  "lineHeight",
  "letterSpacing",
  "align",
  "uppercase",
  "color",
]);

export const BUILT_IN_FONT_FAMILIES = new Set([
  "sans",
  "heading",
  "serif",
  "mono",
]);

export const FONT_ALIGNS = new Set(["start", "center", "end"]);

/** Card font sizes render as inline `font-size`, so the floor that keeps Han
 *  legible and the ceiling that keeps a card from overflowing its frame are
 *  enforced here rather than clamped silently at render time. */
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 96;
/** Tracking beyond this is either unreadable or a typo. */
export const FONT_TRACKING_MAX = 10;

export const KNOWN_BINDINGS = new Set([
  "body",
  "date",
  "day",
  "day.padded",
  "stats",
  "locale",
  "brand.product",
  "brand.markLight",
  "brand.markDark",
]);

export const COLOR_KEYWORDS = new Set(["none", "currentColor", "transparent"]);

export const APP_COLOR_TOKENS = new Set([
  "foreground",
  "background",
  "card",
  "muted",
  "border",
]);

export const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const SVG_FILTER_REF_PATTERN = /^url\(#[A-Za-z0-9_-]+\)$/;

export const KNOWN_MANIFEST_KEYS = new Set([
  "specVersion",
  "id",
  "version",
  "name",
  "description",
  "author",
  "license",
  "defaultEnabled",
  "minAppVersion",
  "contributes",
]);

export const KNOWN_CARD_KEYS = new Set([
  "id",
  "kind",
  "name",
  "description",
  "preview",
  "size",
  "options",
  "document",
  "entry",
]);

export const KNOWN_OPTION_KEYS = new Set([
  "key",
  "type",
  "label",
  "default",
  "maxLength",
  "min",
  "max",
  "step",
  "choices",
]);

export const MAX_NODE_DEPTH = 64;

export const decoder = new TextDecoder();
