import { describe, expect, it } from "vitest";
import {
  buildCustomRamp,
  contrastRatio,
  hexToOklch,
  normalizeHexColor,
  oklchToHex,
} from "./brand-ramp";

describe("normalizeHexColor", () => {
  it("accepts 3- and 6-digit forms and normalizes case/prefix", () => {
    expect(normalizeHexColor("#FF6A00")).toBe("#ff6a00");
    expect(normalizeHexColor("f0a")).toBe("#ff00aa");
    expect(normalizeHexColor("  #7c3aed ")).toBe("#7c3aed");
  });

  it("rejects invalid input", () => {
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("green")).toBeNull();
    expect(normalizeHexColor("#gggggg")).toBeNull();
  });
});

describe("buildCustomRamp", () => {
  it("keeps the seed's hue and relative saturation in the primary step", () => {
    const ramp = buildCustomRamp("#0090ff");
    const primary = hexToOklch(ramp.steps[500]);
    expect(primary.H).toBeCloseTo(252, 0);
    // flame track pins lightness; the seed only drives hue/chroma
    expect(primary.L).toBeCloseTo(0.63, 1);
  });

  it("reproduces the lightness track exactly", () => {
    const ramp = buildCustomRamp("#ff6a00");
    for (const [step, expected] of Object.entries({
      50: 0.96,
      100: 0.93,
      200: 0.87,
      300: 0.79,
      400: 0.72,
      500: 0.63,
      600: 0.55,
      700: 0.47,
    })) {
      expect(
        hexToOklch(ramp.steps[step as unknown as keyof typeof ramp.steps]).L,
      ).toBeCloseTo(expected, 2);
    }
  });

  it("keeps white foregrounds for mid-tone seeds like the flame baseline", () => {
    const ramp = buildCustomRamp("#0090ff");
    expect(ramp.primaryForegroundLight).toBe("#ffffff");
    expect(ramp.gradientForeground).toBe("#ffffff");
  });

  it("the fixed lightness track keeps every hue mid-tone enough for white text", () => {
    // 24-hue sweep at full saturation: if some future hue class renders
    // bright at the 500/coral lightness, the fg guards in buildCustomRamp
    // would flip to dark — this test documents that none do today.
    for (let hue = 0; hue < 360; hue += 15) {
      const hex = oklchToHex(0.63, 0.2, hue);
      const ramp = buildCustomRamp(hex);
      expect(ramp.gradientForeground).toBe("#ffffff");
      expect(ramp.primaryForegroundLight).toBe("#ffffff");
    }
  });

  it("survives degenerate neutral seeds", () => {
    for (const seed of ["#000000", "#ffffff", "#808080"]) {
      const ramp = buildCustomRamp(seed);
      for (const value of [...Object.values(ramp.steps), ramp.coral]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("round-trips a hex through oklch losslessly-ish", () => {
    const hex = "#e93d82";
    const { L, C, H } = hexToOklch(hex);
    expect(oklchToHex(L, C, H)).toBe(hex);
  });

  it("every primary pairs with a usable foreground (AA or clearly better option)", () => {
    for (const seed of [
      "#facc15",
      "#ff6a00",
      "#22c55e",
      "#1e3a8a",
      "#f472b6",
      "#0ea5e9",
      "#000000",
      "#7c3aed",
    ]) {
      const ramp = buildCustomRamp(seed);
      for (const [bg, fg] of [
        [ramp.steps[500], ramp.primaryForegroundLight],
        [ramp.steps[400], ramp.primaryForegroundDark],
        [ramp.coral, ramp.gradientForeground],
      ] as const) {
        const ratio = contrastRatio(fg, bg);
        // 4.5 = AA; below that only acceptable when the alternative extreme
        // scores even worse (mid-tone seeds where white is the best look).
        expect(
          ratio >= 4.5 ||
            ratio >= contrastRatio("#ffffff", bg) * 0.99 ||
            ratio >=
              contrastRatio(oklchToHex(0.25, 0.04, hexToOklch(seed).H), bg) *
                0.99,
        ).toBe(true);
        expect(ratio).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
