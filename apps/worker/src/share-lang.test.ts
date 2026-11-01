import { describe, expect, it } from "vitest";
import { detectShareLang } from "./routes/share-page";

describe("detectShareLang", () => {
  it("recognizes Japanese by kana", () => {
    expect(detectShareLang("今日は良い天気ですね")).toBe("ja");
    expect(detectShareLang("カタカナのみ")).toBe("ja");
  });
  it("recognizes Korean by hangul", () => {
    expect(detectShareLang("오늘은 좋은 날씨네요")).toBe("ko");
  });
  it("recognizes Arabic by its block", () => {
    expect(detectShareLang("نص عربي للاختبار")).toBe("ar");
  });
  it("keeps Han-only text on the Chinese default", () => {
    // Shared Han must not be guessed: Simplified is the default here, and
    // treating it as Japanese/Korean would swap the whole app's face.
    expect(detectShareLang("今天天气很好")).toBe("zh-CN");
    expect(detectShareLang("hello world")).toBe("zh-CN");
    expect(detectShareLang("")).toBe("zh-CN");
  });
});
