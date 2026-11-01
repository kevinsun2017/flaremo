/**
 * Resource-name normalization shared by the Memos compatibility surfaces.
 * Memos clients accept both the bare id and the fully qualified resource
 * name; these helpers canonicalize to the qualified form.
 */

export function normalizeMemoName(value: string) {
  return value.startsWith("memos/") ? value : `memos/${value}`;
}

export function normalizeAttachmentName(value: string) {
  return value.startsWith("attachments/") ? value : `attachments/${value}`;
}
