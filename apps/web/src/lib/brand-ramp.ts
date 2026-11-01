/**
 * Derives a full brand ramp (the same nine `--brand-*` steps the preset
 * blocks define) from a single seed hex, so a custom accent recolors the
 * whole UI — buttons, badges, rings, gradient CTA — instead of tinting one
 * element.
 *
 * Strategy: the seed contributes hue and chroma only; lightness follows the
 * flame ramp's fixed track so every seed lands on the same visual weight the
 * presets were tuned for. Chroma is clamped per step to sRGB gamut (greens
 * and cyans cap well below orange) and foreground colors are chosen by WCAG
 * contrast against the *rendered* (clamped) colors, so bright seeds like
 * amber automatically get dark button text.
 *
 * All returned colors are clamped hex strings — deterministic between the
 * inline styles we inject and what the browser paints.
 */

type Oklch = { L: number; C: number; H: number };

/** flame ramp track, copied from index.css `:root` defaults. */
const LIGHTNESS_TRACK = {
  50: 0.96,
  100: 0.93,
  200: 0.87,
  300: 0.79,
  400: 0.72,
  500: 0.63,
  600: 0.55,
  700: 0.47,
} as const;

/** chroma ratios relative to the 500 step, mirroring flame's curve. */
const CHROMA_RATIOS = {
  50: 0.13,
  100: 0.26,
  200: 0.47,
  300: 0.71,
  400: 0.89,
  500: 1,
  600: 1.05,
  700: 0.95,
} as const;

export type CustomRamp = {
  steps: Record<keyof typeof LIGHTNESS_TRACK, string>;
  coral: string;
  gradientForeground: string;
  primaryForegroundLight: string;
  primaryForegroundDark: string;
};

const WHITE = "#ffffff";
const DARK_FALLBACK = { L: 0.25, C: 0.04 };
const DARK_FALLBACK_STEPS = { L: 0.2, C: 0.03 };

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** oklch → linear sRGB triple (unclamped; >1/<0 means out of gamut). */
function oklchToLinearRgb(L: number, C: number, H: number) {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(L: number, C: number, H: number): boolean {
  return oklchToLinearRgb(L, C, H).every((c) => c >= -1e-4 && c <= 1 + 1e-4);
}

export function oklchToHex(L: number, C: number, H: number): string {
  const [lr, lg, lb] = oklchToLinearRgb(L, C, H);
  const to255 = (v: number) => linearToSrgb(Math.max(0, Math.min(1, v)));
  return `#${[to255(lr), to255(lg), to255(lb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToOklch(hex: string): Oklch {
  const h = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const aa = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(aa * aa + bb * bb);
  let H = (Math.atan2(bb, aa) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

/** Largest chroma that stays inside sRGB at the given lightness/hue. */
function maxChroma(L: number, H: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, H)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function wcagLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) =>
    srgbToLinear(parseInt(h.slice(i, i + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = wcagLuminance(a);
  const lb = wcagLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export function normalizeHexColor(raw: string): string | null {
  let value = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/.test(value)) return null;
  return `#${value}`;
}

/**
 * Builds the ramp for one seed. The seed's chroma (clamped to gamut at the
 * 500 step's lightness) drives saturation across the ramp; hue stays fixed —
 * flame's coral hue-drift is preset artistry, not something a seed can infer.
 */
export function buildCustomRamp(seedHex: string): CustomRamp {
  const seed = hexToOklch(seedHex);
  const hue = seed.H;
  const baseChroma = Math.min(seed.C, maxChroma(0.63, hue) * 0.97);
  const steps = {} as CustomRamp["steps"];
  for (const step of Object.keys(LIGHTNESS_TRACK)) {
    const L = LIGHTNESS_TRACK[step as unknown as keyof typeof LIGHTNESS_TRACK];
    const chroma = Math.min(
      baseChroma * CHROMA_RATIOS[step as unknown as keyof typeof CHROMA_RATIOS],
      maxChroma(L, hue) * 0.98,
    );
    steps[step as unknown as keyof CustomRamp["steps"]] = oklchToHex(
      L,
      chroma,
      hue,
    );
  }
  const coral = oklchToHex(
    0.64,
    Math.min(baseChroma * 1.1, maxChroma(0.64, hue) * 0.98),
    hue,
  );

  // Foregrounds are decided against the rendered (gamut-clamped) colors, not
  // the ideal oklch numbers. White is the default look (matches the shipped
  // flame aesthetics on mid tones like blue, where white sits at ~3.5); dark
  // text only takes over on genuinely bright backgrounds.
  const fgFor = (bg: string, dark: { L: number; C: number }): string => {
    const whiteContrast = contrastRatio(WHITE, bg);
    if (whiteContrast >= 3) return WHITE;
    const darkHex = oklchToHex(dark.L, dark.C, hue);
    if (contrastRatio(darkHex, bg) >= 4.5) return darkHex;
    return whiteContrast >= contrastRatio(darkHex, bg) ? WHITE : darkHex;
  };
  const primaryForegroundLight = fgFor(steps[500], DARK_FALLBACK);
  // Dark theme primary sits on the 400 step (L 0.72), where dark text is the
  // flame default; only flip to white if the seed renders too dark for it.
  const primaryForegroundDark = (() => {
    const darkHex = oklchToHex(
      DARK_FALLBACK_STEPS.L,
      DARK_FALLBACK_STEPS.C,
      hue,
    );
    return contrastRatio(darkHex, steps[400]) >= 4.5
      ? darkHex
      : contrastRatio(WHITE, steps[400]) >= contrastRatio(darkHex, steps[400])
        ? WHITE
        : darkHex;
  })();
  // The gradient spans 400 → coral where the shipped flame look is white;
  // only a genuinely bright gradient end (lime-class seeds) flips to dark.
  const gradientThreshold = 2.8;
  const gradientForeground =
    contrastRatio(WHITE, coral) >= gradientThreshold
      ? WHITE
      : oklchToHex(DARK_FALLBACK_STEPS.L, DARK_FALLBACK_STEPS.C, hue);

  return {
    steps,
    coral,
    gradientForeground,
    primaryForegroundLight,
    primaryForegroundDark,
  };
}
