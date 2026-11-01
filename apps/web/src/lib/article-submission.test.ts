import { describe, expect, it, vi } from "vitest";
import {
  createArticleWithAttachments,
  MAX_ARTICLE_CONTENT_LENGTH,
} from "./article-submission";

vi.mock("@/api", () => ({
  createArticle: vi.fn(async (input) => ({
    article: { id: "articles/art-123", ...input },
  })),
  uploadAttachment: vi.fn(async ({ file }: { file: File }) => ({
    id: `att-${file.name}`,
    filename: file.name,
    content_type: file.type || "text/plain",
  })),
}));

describe("createArticleWithAttachments", () => {
  it("creates article with title, lang, and claims preuploaded attachments", async () => {
    const { createArticle } = await import("@/api");

    const article = await createArticleWithAttachments(
      {
        title: "Test Article Title",
        content: "Here is the article body.",
        visibility: "private",
        tags: [],
        files: [],
        preuploadedAttachmentNames: ["existing-img-1"],
      },
      { title: "Test Article Title", lang: "zh-CN" },
    );

    expect(createArticle).toHaveBeenCalledWith({
      title: "Test Article Title",
      content: "Here is the article body.",
      attachment_names: ["existing-img-1"],
      lang: "zh-CN",
    });
    expect(article.id).toBe("articles/art-123");
  });

  it("uploads files and stitches image markdown into body", async () => {
    const { createArticle } = await import("@/api");

    const imageFile = new File(["test-image-bytes"], "photo.png", {
      type: "image/png",
    });

    await createArticleWithAttachments({
      title: "",
      content: "Initial text",
      visibility: "private",
      tags: [],
      files: [imageFile],
    });

    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "",
        content: expect.stringContaining(
          "![photo.png](/file/attachments/att-photo.png/photo.png)",
        ),
        attachment_names: ["att-photo.png"],
      }),
    );
  });

  it("rejects content exceeding MAX_ARTICLE_CONTENT_LENGTH", async () => {
    const hugeContent = "a".repeat(MAX_ARTICLE_CONTENT_LENGTH + 1);

    await expect(
      createArticleWithAttachments({
        content: hugeContent,
        visibility: "private",
        tags: [],
        files: [],
      }),
    ).rejects.toThrow("article-too-long");
  });
});
