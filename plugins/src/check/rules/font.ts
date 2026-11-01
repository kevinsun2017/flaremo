import type { Checker } from "../checker";
/** Validate a numeric font field against a range. `undefined` is allowed —
 *  omitted fields inherit. */
export function checkFontNumber(
  checker: Checker,
  value: unknown,
  where: string,
  bounds: { min: number; max: number; unit: string; integer: boolean },
): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    checker.error("style/invalid", `${where}: must be a finite number`);
    return;
  }
  if (bounds.integer && !Number.isInteger(value)) {
    checker.error("style/invalid", `${where}: must be a whole number`);
    return;
  }
  if (value < bounds.min || value > bounds.max) {
    checker.error(
      "style/invalid",
      `${where}: ${value}${bounds.unit} is outside the supported range ${bounds.min}–${bounds.max}${bounds.unit}`,
    );
  }
}

/** `lineHeight` accepts a unitless multiple or a CSS length string. A bare
 *  string like "1.8" is a common authoring slip that React renders verbatim,
 *  so require an explicit unit when it is a string. */
export function checkLineHeight(
  checker: Checker,
  value: unknown,
  where: string,
): void {
  if (value === undefined) return;
  if (typeof value === "number") {
    checkFontNumber(checker, value, where, {
      min: 0.5,
      max: 4,
      unit: "",
      integer: false,
    });
    return;
  }
  if (typeof value === "string") {
    if (!/^\d*\.?\d+(px|em|rem|%)$/.test(value.trim())) {
      checker.error(
        "style/invalid",
        `${where}: "${value}" must be a unitless multiple (e.g. 1.8) or carry a unit (e.g. "1.8em", "24px")`,
      );
    }
    return;
  }
  checker.error(
    "style/invalid",
    `${where}: must be a number or a CSS length string`,
  );
}
