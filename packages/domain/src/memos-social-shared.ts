import { ValidationError } from "./errors";

export type SocialPageCursor = {
  kind: "memo-comments" | "memo-reactions";
  id: string;
  sortValue: string;
  order: string;
  pageSize: number;
};

export function normalizePageSize(value: number | undefined) {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError("Page size must be a positive integer");
  }
  return Math.min(value, 1000);
}

export function encodeSocialPageToken(cursor: SocialPageCursor) {
  return btoa(JSON.stringify(cursor));
}

export function decodeSocialPageToken(
  token: string,
  kind: SocialPageCursor["kind"],
  order: string,
  pageSize: number,
) {
  try {
    const cursor = JSON.parse(atob(token)) as Partial<SocialPageCursor>;
    if (
      cursor.kind === kind &&
      typeof cursor.id === "string" &&
      typeof cursor.sortValue === "string" &&
      cursor.order === order &&
      cursor.pageSize === pageSize
    ) {
      return cursor as SocialPageCursor;
    }
  } catch {
    // Fall through to one stable validation error.
  }
  throw new ValidationError("Invalid page token");
}

export function createSocialResourceId(prefix: "reactions" | "shortcuts") {
  return `${prefix}/${crypto.randomUUID()}`;
}
