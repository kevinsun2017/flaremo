import { createArticle, uploadAttachment } from "@/api";
import { inlineImageMarkdown } from "@/lib/image-insert";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";

export const MAX_ARTICLE_CONTENT_LENGTH = 200_000;

/**
 * A markdown reference for a file picked in the composer. Images become inline
 * images; everything else becomes a link — `![]()` on a PDF would only render
 * as a broken image. Both forms keep the attachment visible in the article
 * body (the editor page renders only inline references) and on the public
 * page, where unreferenced attachments would otherwise surface in a gallery
 * the author never saw while writing.
 */
function attachmentMarkdown(attachment: {
  id: string;
  filename: string;
  content_type: string | null;
}): string {
  const path = `/file/attachments/${attachment.id}/${encodeURIComponent(attachment.filename)}`;
  return attachment.content_type?.toLowerCase().startsWith("image/")
    ? inlineImageMarkdown(attachment.id, attachment.filename)
    : `[${attachment.filename.replace(/[[\]]/g, "")}](${path})`;
}

/**
 * The composer → article bridge: files picked in the composer are uploaded
 * unbound, then the draft is created with every attachment claimed in the same
 * request. The claim is the only binding these rows ever get — the article
 * never exists before the user presses the button, so nothing else can bind
 * them and the orphan GC would collect them within its 7-day window.
 */
export async function createArticleWithAttachments(
  input: MemoCaptureInput,
  options?: { title?: string; lang?: string },
) {
  const uploaded: Array<{
    id: string;
    filename: string;
    content_type: string | null;
  }> = [];
  for (const file of input.files) {
    const attachment = await uploadAttachment({ file });
    uploaded.push({
      id: attachment.id,
      filename: attachment.filename,
      content_type: attachment.content_type,
    });
  }

  const content = [
    input.content.trim(),
    ...uploaded.map((attachment) => attachmentMarkdown(attachment)),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (content.length > MAX_ARTICLE_CONTENT_LENGTH) {
    throw new Error("article-too-long");
  }

  const title = (options?.title ?? input.title ?? "").trim();

  const { article } = await createArticle({
    title,
    content,
    attachment_names: [
      ...(input.preuploadedAttachmentNames ?? []),
      ...uploaded.map((attachment) => attachment.id),
    ],
    ...(options?.lang ? { lang: options.lang } : {}),
  });
  return article;
}
