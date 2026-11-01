import { describe, expect, it } from "vitest";
import { renderShareDocument } from "./routes/share-page";

const base = {
  origin: "https://example.test",
  token: "t0ken",
  product: "FlareMo",
  faviconUrl: null,
  faviconType: null,
};

function docOf(content: string): string {
  return renderShareDocument({
    ...base,
    data: {
      memo: {
        id: "m1",
        content,
        createdAt: "2026-09-19T00:00:00.000Z",
      },
      user: { id: "u1", name: "Author" },
      attachments: [],
    },
  } as unknown as Parameters<typeof renderShareDocument>[0]);
}

describe("share page language", () => {
  it("declares Japanese for a kana note and scopes the font fallbacks", () => {
    const html = docOf("今日は良い天気ですね");
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain(":root:lang(ja)");
    // og:locale takes the underscored form; a bare language code is valid
    // (the detector cannot know the region).
    expect(html).toContain('content="ja"');
  });

  it("keeps the Chinese default for a Han-only note", () => {
    const html = docOf("今天天气很好");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('content="zh_CN"');
  });

  it("declares Korean and Arabic from their scripts", () => {
    expect(docOf("오늘은 좋은 날씨네요")).toContain('<html lang="ko">');
    expect(docOf("نص عربي")).toContain('<html lang="ar">');
  });
});
