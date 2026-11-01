// @vitest-environment jsdom
import type { ShareCardDocument } from "@flaremo/plugins";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShareCardDocumentView } from "./share-card-document";
import { shareBodyText } from "./share-image-dialog";

describe("shareBodyText", () => {
  it("folds excessive newlines to a single blank line and normalizes CRLF", () => {
    const raw = "First line\r\n\r\n\r\n\r\nSecond line\r\n\r\n\r\nThird line";
    expect(shareBodyText(raw)).toBe("First line\n\nSecond line\n\nThird line");
  });

  it("strips markdown decoration while preserving plain text", () => {
    const raw =
      "## Title\n**bold** and *italic* and `code` and [link](https://example.com)";
    expect(shareBodyText(raw)).toBe("Title\nbold and italic and code and link");
  });
});

describe("ShareCardDocumentView", () => {
  const dummyDoc: ShareCardDocument = {
    specVersion: 1,
    root: {
      type: "column",
      style: {
        minHeight: "100%",
        padding: 20,
      },
      children: [
        {
          type: "text",
          text: "{body}",
          style: {
            flex: 1,
            font: { size: 14 },
          },
        },
      ],
    },
  };

  const context = {
    data: {
      body: "Hello FlareMo\nLine 2\nLine 3\nLine 4",
      date: "2026-09-20",
      day: "20",
      stats: "",
      locale: "zh-CN",
      brand: {
        product: "FlareMo",
        markLight: "",
        markDark: "",
      },
    },
    options: {},
    mode: "light" as const,
  };

  it("renders with minHeight instead of fixed height and without overflow:hidden", () => {
    const html = renderToStaticMarkup(
      <ShareCardDocumentView
        context={context}
        document={dummyDoc}
        height={420}
        mode="light"
        width={340}
      />,
    );

    expect(html).toContain("min-height:420px");
    expect(html).toContain("width:340px");
    // Ensure overflow:hidden is not clipping the container
    expect(html).not.toContain("overflow:hidden");
    // Ensure body with flex uses flex-basis: auto to prevent content overflow collapsing
    expect(html).not.toContain("flex-basis:0");
    expect(html).not.toContain("min-height:0");
    expect(html).toContain("flex-basis:auto");
    expect(html).toContain("Hello FlareMo");
  });

  it("splits paragraphs with compact margin when body has multiple paragraphs", () => {
    const multiParaContext = {
      ...context,
      data: {
        ...context.data,
        body: "Paragraph 1\n\nParagraph 2\n\nParagraph 3",
      },
    };

    const html = renderToStaticMarkup(
      <ShareCardDocumentView
        context={multiParaContext}
        document={dummyDoc}
        height={420}
        mode="light"
        width={340}
      />,
    );

    expect(html).toContain("margin-top:8px");
    expect(html).toContain("Paragraph 1");
    expect(html).toContain("Paragraph 2");
    expect(html).toContain("Paragraph 3");
  });
});
