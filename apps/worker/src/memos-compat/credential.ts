/**
 * Credential-header helpers shared by the Memos compatibility surfaces.
 * Callers keep their own error mapping: each surface throws its own error
 * type when the header is malformed or the credential is rejected, so this
 * module only classifies, it never throws.
 */

/**
 * Returns the token of a `Bearer <token>` Authorization header, or null when
 * the header is absent of the bearer scheme or malformed.
 */
export function splitBearerToken(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || !parts[1]) {
    return null;
  }
  return parts[1];
}

/**
 * Better Auth signals failed username/password sign-ins with this error code.
 * Both the current and Connect surfaces collapse it to a generic
 * "unmatched username and password" client error.
 */
export function isBetterAuthCredentialError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    !Array.isArray(error) &&
    (error as { code?: unknown }).code === "INVALID_USERNAME_OR_PASSWORD"
  );
}
