/**
 * Inline body images reference attachments through the Memos-compatible
 * `/file/attachments/{id}/{filename}` bridge. The path is context-portable by
 * design: same-origin cookie auth renders it inside the app, and the public
 * share page appends `?share_token=` for anonymous visitors. These helpers
 * parse such references out of a memo body.
 */

/** Resolves to the bare attachment id referenced by a `/file/attachments/` URL. */
const ATTACHMENT_REF = /\/file\/attachments\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

export function extractReferencedAttachmentIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(ATTACHMENT_REF)) {
    ids.add(match[1]);
  }
  return ids;
}

/**
 * Intrinsic pixel dimensions reported at upload time (see
 * parseAttachmentDimensions on the worker). Older attachments carry no
 * dimensions; callers fall back to natural sizing for those.
 */
export function attachmentImageDimensions<
  T extends { payload?: Record<string, unknown> | null },
>(attachment: T): { width: number; height: number } | undefined {
  const width = attachment.payload?.width;
  const height = attachment.payload?.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { width, height };
}

/**
 * Builds a lookup from a `/file/attachments/` URL to the referenced
 * attachment's dimensions, for giving markdown body images an intrinsic box.
 */
export function createImageDimensionResolver<
  T extends { name: string; payload?: Record<string, unknown> | null },
>(
  attachments: T[],
): (src: string) => { width: number; height: number } | undefined {
  const byId = new Map<string, { width: number; height: number }>();
  for (const attachment of attachments) {
    const dimensions = attachmentImageDimensions(attachment);
    if (dimensions) {
      byId.set(attachment.name.replace(/^attachments\//, ""), dimensions);
    }
  }
  return (src: string) => {
    // Non-global copy: a global regex's exec is stateful (lastIndex), and the
    // shared ATTACHMENT_REF above is owned by matchAll callers.
    const match = /\/file\/attachments\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(src);
    return match ? byId.get(match[1]) : undefined;
  };
}

/**
 * Attachments already referenced by the body are shown inline, so the gallery
 * keeps only the rest. Unreferenced attachments — an audio file, a photo the
 * author never placed — must not vanish.
 */
export function filterUnreferencedAttachments<T extends { name: string }>(
  attachments: T[],
  content: string,
): T[] {
  const referenced = extractReferencedAttachmentIds(content);
  return attachments.filter(
    (attachment) =>
      !referenced.has(attachment.name.replace(/^attachments\//, "")),
  );
}

/**
 * Appends the share token to `/file/attachments/` targets so the public share
 * page can fetch body images anonymously. Only markdown link/image destinations
 * are touched, fenced code is skipped, and URLs that already carry a query get
 * `&` instead of `?`.
 */
export function injectShareTokenIntoFileUrls(
  content: string,
  token: string,
): string {
  let inFence = false;
  return content
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/(\]\(\/file\/attachments\/[^\s)]*)/g, (target) =>
        target.includes("?")
          ? `${target}&share_token=${token}`
          : `${target}?share_token=${token}`,
      );
    })
    .join("\n");
}
