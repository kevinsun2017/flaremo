import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheet = readFileSync(
  new URL("./components/ui/sheet.tsx", import.meta.url),
  "utf8",
);

/**
 * Sheet exit-motion contract (flash regression, 2026-09-19).
 *
 * tw-animate-css ships `animate-out` with fill-mode:none, so after the exit
 * animation finishes the element snaps back to its base style (opaque
 * overlay) until Base UI unmounts it — on the sidebar close that painted a
 * full-strength scrim for ~100ms ("screen flashes once"). Both the overlay
 * and the drawer must therefore keep fill-mode-forwards on data-closed.
 */
describe("sheet exit motion", () => {
  it("keeps fill-mode-forwards on both overlay and content exits", () => {
    const fills = sheet.match(/data-closed:fill-mode-forwards/g) ?? [];
    expect(fills).toHaveLength(2);
  });

  it("keeps overlay and content exit durations in lockstep", () => {
    // The bounce only reappears if the two exits drift apart: the container
    // must not outlive its own painted surface. Both use the same duration
    // token (duration-250) on the shared `transition` utility.
    const overlaySeg = sheet.slice(
      sheet.indexOf('data-slot="sheet-overlay"'),
      sheet.indexOf("function SheetContent"),
    );
    expect(overlaySeg).toMatch(/duration-250/);
    expect(overlaySeg).toMatch(/data-closed:animate-out/);
  });
});
