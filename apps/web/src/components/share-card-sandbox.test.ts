import { describe, expect, it } from "vitest";
import { buildSandboxSrcdoc } from "./share-card-sandbox";

/**
 * `buildSandboxSrcdoc` is the only channel through which a sandboxed share
 * card learns its language. The frame is opaque-origin, so the card cannot
 * read the app's font tokens, and its CSP (`font-src data:`) blocks packaged
 * webfonts — the browser's own Han fallback is disambiguated *solely* by the
 * document language stamped here. Without it, a Japanese user's exported card
 * is painted with Chinese glyph forms.
 *
 * These assertions are about that stamp, not about the bridge: the bridge is
 * exercised by the export flow.
 */

const CARD_WITH_HEAD = `<!doctype html><html><head><meta charset="utf-8"></head><body><div>hi</div></body></html>`;
const CARD_NO_HEAD = `<!doctype html><html><body><div>hi</div></body></html>`;
const CARD_FRAGMENT = `<div>hi</div>`;

describe("buildSandboxSrcdoc language stamping", () => {
  it("stamps lang and a matching dir for every locale", () => {
    for (const [locale, dir] of [
      ["zh-CN", "ltr"],
      ["ja", "ltr"],
      ["ko", "ltr"],
      ["en-US", "ltr"],
      ["ar", "rtl"],
    ] as const) {
      const out = buildSandboxSrcdoc(CARD_WITH_HEAD, locale);
      expect(out, locale).toContain(
        `document.documentElement.lang=${JSON.stringify(locale)}`,
      );
      expect(out, locale).toContain(
        `document.documentElement.dir=${JSON.stringify(dir)}`,
      );
    }
  });

  it("defaults to en-US when no locale is given", () => {
    const out = buildSandboxSrcdoc(CARD_WITH_HEAD);
    expect(out).toContain('document.documentElement.lang="en-US"');
    expect(out).toContain('document.documentElement.dir="ltr"');
  });

  it("injects into <head> when the card has one", () => {
    const out = buildSandboxSrcdoc(CARD_WITH_HEAD, "ja");
    // Must land inside head, before the body content.
    expect(out.indexOf("document.documentElement.lang")).toBeLessThan(
      out.indexOf("<body"),
    );
    expect(out.match(/<head[^>]*>/gi)).toHaveLength(1);
  });

  it("synthesizes a <head> when the card omits one", () => {
    const out = buildSandboxSrcdoc(CARD_NO_HEAD, "ko");
    expect(out).toContain("<head>");
    expect(out.indexOf("document.documentElement.lang")).toBeLessThan(
      out.indexOf("<body"),
    );
  });

  it("handles a bare fragment with no html element at all", () => {
    const out = buildSandboxSrcdoc(CARD_FRAGMENT, "ar");
    expect(out).toContain('document.documentElement.lang="ar"');
    expect(out).toContain('document.documentElement.dir="rtl"');
    // The stamp has to end up before the original markup.
    expect(out.indexOf("document.documentElement.lang")).toBeLessThan(
      out.indexOf("<div>hi</div>"),
    );
  });

  it("runs the stamp before the bridge script", () => {
    // The bridge posts `ready` once fonts settle; if the lang stamp ran after
    // it, the card could paint once with the wrong fallback.
    const out = buildSandboxSrcdoc(CARD_WITH_HEAD, "ja");
    expect(out.indexOf("document.documentElement.lang")).toBeLessThan(
      out.indexOf("window.FlareMo"),
    );
  });

  it("keeps the CSP that blocks packaged webfonts", () => {
    const out = buildSandboxSrcdoc(CARD_WITH_HEAD, "ja");
    expect(out).toContain("font-src data:");
    expect(out).toContain("default-src 'none'");
  });

  it("escapes the locale so it cannot break out of the script", () => {
    // The locale reaches us from app state, but the card is an interpolation
    // site — JSON.stringify is the guard, and it must stay.
    const out = buildSandboxSrcdoc(CARD_WITH_HEAD, 'x";alert(1);//');
    expect(out).not.toContain('lang=x";alert(1)');
    expect(out).toContain('\\"');
  });
});
