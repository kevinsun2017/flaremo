// Pure reconciliation helpers for the voice capture page's save path.
//
// `createMemo` is not idempotent, but the capture flow may retry one logical
// submission: the client id in `payload.client_id` identifies it, and a retry
// that lands after the first attempt committed gets the same row back. These
// helpers decide whether that row already carries the last payload we sent
// (nothing to do), needs the newer payload written onto it (reconcile), or has
// moved on and must not be touched.
import type { LocalCapture } from "@flaremo/contracts";
import { createMemo, updateMemo } from "@/api";

/**
 * Folds the live recording snapshot into the persisted capture draft. A capture
 * that never started keeps its stored value untouched; otherwise text, start
 * time, duration (whole seconds, never negative) and the gap flag are refreshed.
 */
export function mergeCaptureSnapshot(
  value: LocalCapture,
  text: string,
  startedAt: number | null,
  stoppedAt: number | null,
  gap: boolean,
): LocalCapture {
  if (!startedAt) return value;
  return {
    ...value,
    text,
    startedAt,
    duration: Math.max(
      0,
      Math.floor(((stoppedAt ?? Date.now()) - startedAt) / 1000),
    ),
    gap,
  };
}

export async function createOrReconcileCaptureMemo(
  input: Parameters<typeof createMemo>[0],
  previousInput: Parameters<typeof createMemo>[0] | null,
) {
  const memo = await createMemo(input);
  if (captureMemoMatchesInput(memo, input)) return memo;

  // A create response can be lost after D1 commits. A retry then returns the
  // row for the same client_id. Reconcile only when that row still matches
  // the exact previous attempt, so another tab's edit is never overwritten.
  if (
    memo.payload.client_id !== input.payload?.client_id ||
    !previousInput ||
    !captureMemoMatchesInput(memo, previousInput)
  ) {
    throw new Error("Capture memo changed after its initial save");
  }
  const desiredTags = normalizedCaptureTags(input);
  return updateMemo(memo.id, {
    content: input.content,
    visibility: input.visibility,
    payload: {
      ...memo.payload,
      ...input.payload,
      tags: desiredTags,
    },
  });
}

export function captureMemoMatchesInput(
  memo: Awaited<ReturnType<typeof createMemo>>,
  input: Parameters<typeof createMemo>[0],
) {
  const desiredTags = normalizedCaptureTags(input);
  const currentTags = Array.from(new Set(memo.payload.tags ?? [])).sort();
  return (
    memo.content === input.content &&
    memo.visibility === input.visibility &&
    desiredTags.length === currentTags.length &&
    desiredTags.every((tag, index) => tag === currentTags[index])
  );
}

export function normalizedCaptureTags(input: Parameters<typeof createMemo>[0]) {
  return Array.from(new Set(input.payload?.tags ?? [])).sort();
}
