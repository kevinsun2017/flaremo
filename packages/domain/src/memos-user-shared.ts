import type { UserRow } from "@flaremo/db";
import { ForbiddenError, ValidationError } from "./errors";

export function parseUserChildResourceName(
  name: string,
  user: UserRow,
  collection: "webhooks" | "notifications",
) {
  const parts = name.split("/").filter(Boolean);
  const userParts = user.id.split("/").filter(Boolean);
  if (
    parts.length !== 4 ||
    parts[0] !== "users" ||
    parts[2] !== collection ||
    !parts[3]
  ) {
    throw new ValidationError(`Invalid ${collection} resource name`);
  }
  if (parts[1] !== userParts[1]) {
    throw new ForbiddenError(
      `Only the current user's ${collection} are available`,
    );
  }
  return parts[3];
}
