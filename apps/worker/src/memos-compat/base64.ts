/**
 * Shared low-level helpers for the Memos-compatible API surfaces
 * (routes/memos-api.ts, routes/memos-current-api.ts,
 * routes/memos-connect-api.ts). Each module below was deduplicated from
 * identical (or verified-equivalent) copies in those route files; behavior
 * is part of the client-facing compat contract, so treat changes as
 * compatibility changes.
 */

export function base64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
