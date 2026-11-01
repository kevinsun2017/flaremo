import { describe, expect, it } from "vitest";
import { isHanLocale } from "./han-locale";

describe("isHanLocale", () => {
  it("matches the locales whose glyphs are Han", () => {
    for (const locale of [
      "zh-CN",
      "zh",
      "zh-Hant",
      "ja",
      "ja-JP",
      "ko",
      "ko-KR",
    ]) {
      expect(isHanLocale(locale), locale).toBe(true);
    }
  });

  it("leaves every other shipped locale alone", () => {
    for (const locale of ["en-US", "fr", "es", "ru", "ar", "de"]) {
      expect(isHanLocale(locale), locale).toBe(false);
    }
  });

  it("tolerates null, undefined and stray whitespace", () => {
    expect(isHanLocale(null)).toBe(false);
    expect(isHanLocale(undefined)).toBe(false);
    expect(isHanLocale("")).toBe(false);
    // `zhx` must not match: the boundary keeps the prefix from over-reaching.
    expect(isHanLocale("zhx")).toBe(false);
    expect(isHanLocale("  ja  ")).toBe(true);
  });
});
