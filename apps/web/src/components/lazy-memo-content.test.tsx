// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { FallbackContent } from "./lazy-memo-content";

describe("LazyMemoContent degraded fallback", () => {
  it("keeps the raw content readable when the markdown chunk fails", () => {
    const html = renderToStaticMarkup(
      <FallbackContent content={"## 标题\n\n**加粗**\n\n正文"} />,
    );
    // The plain-text body stays intact (nothing silently dropped).
    expect(html).toContain("## 标题");
    expect(html).toContain("**加粗**");
    expect(html).toContain("正文");
  });

  it("makes the degradation visible instead of silent", () => {
    const html = renderToStaticMarkup(<FallbackContent content={"正文"} />);
    // The rendered key is the i18n marker under test; the notice lives beside
    // the plain text so a reader can tell rich rendering was skipped.
    expect(html).toContain("common.renderFallback");
  });

  it("carries through a caller-provided className on the plain text", () => {
    const html = renderToStaticMarkup(
      <FallbackContent className="break-words text-sm" content={"正文"} />,
    );
    expect(html).toContain("break-words");
    expect(html).toContain("text-sm");
  });
});
