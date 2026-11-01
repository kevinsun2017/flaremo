import { describe, expect, it } from "vitest";
import { renderArticleDocument } from "./routes/article-page";

const base = { origin: "https://example.test", product: "FlareMo" };

function docFor(lang: string | null): string {
  return renderArticleDocument({
    ...base,
    data: {
      article: {
        id: "a1",
        slug: "hello",
        title: "Title",
        content: "Body text",
        lang,
        status: "published",
        createdAt: "2026-09-19T00:00:00.000Z",
        publishedAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
      user: { id: "u1", name: "Author" },
      attachments: [],
    },
  } as unknown as Parameters<typeof renderArticleDocument>[0]);
}

describe("article page direction", () => {
  it("declares rtl for Arabic and ltr for everything else", () => {
    expect(docFor("ar")).toContain('dir="rtl"');
    expect(docFor("ar")).toContain('lang="ar"');
    expect(docFor("ja")).toContain('dir="ltr"');
    expect(docFor(null)).toContain('dir="ltr"');
  });

  it("uses logical properties so RTL flips without extra rules", () => {
    const html = docFor("ar");
    expect(html).toContain("padding-inline-start: 1.5em");
    expect(html).toContain("margin-inline-end: .4em");
    expect(html).toContain("text-align: start");
    // Physical properties would not mirror.
    expect(html).not.toContain("padding-left: 1.5em");
    expect(html).not.toContain("margin-right: .4em");
  });

  it("keeps the language-scoped Han fallbacks", () => {
    expect(docFor("ja")).toContain(":root:lang(ja)");
  });
});

describe("share page chrome language", () => {
  it("marks the Chinese-only footer with its own lang", async () => {
    const { renderShareDocument } = await import("./routes/share-page");
    const html = renderShareDocument({
      origin: "https://example.test",
      token: "t",
      product: "FlareMo",
      faviconUrl: null,
      faviconType: null,
      data: {
        memo: {
          id: "m",
          content: "日本語のメモ",
          createdAt: "2026-09-19T00:00:00.000Z",
        },
        user: { id: "u", name: "A" },
        attachments: [],
      },
    } as unknown as Parameters<typeof renderShareDocument>[0]);
    // The note drives <html lang>, the chrome keeps Chinese glyph forms.
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<footer lang="zh-CN">');
  });
});
