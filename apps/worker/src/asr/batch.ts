import {
  CAPTURE_BATCH_MAX_BYTES,
  CAPTURE_BATCH_SLICE_MS,
  type CaptureUtterance,
} from "@flaremo/contracts";

// Batch transcription (asr-minimax.md): a second provider contract beside
// StreamingAsrProvider. One call covers one client slice (≤480 s / ≤16 MB);
// the client uploads slices sequentially with their timeline offsets, so the
// provider only ever sees a single chunk. The returned utterances share the
// streaming utterances' millisecond timeline, feeding one transcript format.
export type BatchUtterance = CaptureUtterance;
export type BatchTranscription = {
  utterances: BatchUtterance[];
  /** Audio duration of the chunk in milliseconds (billing basis). */
  durationMs: number;
};
export type BatchTranscribeOptions = {
  /** BCP-47 hint; "auto" or omitted lets the provider code-switch freely. */
  language?: string;
  /** Chunk offset on the session timeline (ms); utterances are offset by it. */
  startMs?: number;
  /** Container mime type so the adapter can name the multipart file. */
  mimeType?: string;
  /** Aborts the upstream request; also bounded by the adapter's own timeout. */
  signal?: AbortSignal;
};
export type BatchAsrProvider = {
  readonly id: "minimax";
  transcribe(
    audio: ArrayBuffer,
    options: BatchTranscribeOptions,
  ): Promise<BatchTranscription>;
};
export const BATCH_ASR_MAX_CHUNK_BYTES = CAPTURE_BATCH_MAX_BYTES;
export const BATCH_ASR_MAX_CHUNK_DURATION_MS = CAPTURE_BATCH_SLICE_MS;
