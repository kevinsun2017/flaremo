import { BRAND_COLOR_STEPS, isUnsafeCSS } from "../../document";
import type { Checker } from "../checker";
import { APP_COLOR_TOKENS, HEX_COLOR_PATTERN } from "../constants";
export function checkColorValue(
  checker: Checker,
  value: unknown,
  where: string,
  options: { keywords?: Set<string> } = {},
): void {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const pair = value as Record<string, unknown>;
    if (typeof pair.light !== "string" || typeof pair.dark !== "string") {
      checker.error(
        "color/invalid",
        `${where}: a light/dark color pair needs both "light" and "dark" strings`,
      );
      return;
    }
    checkColorValue(checker, pair.light, `${where}.light`, options);
    checkColorValue(checker, pair.dark, `${where}.dark`, options);
    return;
  }
  if (typeof value !== "string") {
    checker.error("color/invalid", `${where}: color must be a string`);
    return;
  }
  const trimmed = value.trim();
  if (options.keywords?.has(trimmed)) return;
  if (isUnsafeCSS(trimmed)) {
    checker.error(
      "color/unsafe",
      `${where}: "${trimmed}" is not allowed (no url()/javascript:)`,
    );
    return;
  }
  if (HEX_COLOR_PATTERN.test(trimmed)) return;
  if (APP_COLOR_TOKENS.has(trimmed)) return;
  if (trimmed.startsWith("brand.")) {
    const step = trimmed.slice("brand.".length);
    if (
      !BRAND_COLOR_STEPS.includes(step as (typeof BRAND_COLOR_STEPS)[number])
    ) {
      checker.error(
        "color/unknown-token",
        `${where}: unknown brand step "${trimmed}" (expected brand.${BRAND_COLOR_STEPS.join(" / brand.")})`,
      );
    }
    return;
  }
  checker.error(
    "color/invalid",
    `${where}: unrecognized color "${trimmed}" (use #rrggbb, a light/dark pair, an app token, or brand.<step>)`,
  );
}
