import { z } from "zod";
import type {
  BatchAsrProvider,
  BatchTranscribeOptions,
  BatchTranscription,
  BatchUtterance,
} from "./batch";
import { AsrProviderError } from "./types";

// MiniMax speech_to_text (asr-1.0), verified against the platform docs
// (asr-minimax.md). Sync multipart upload, Bearer auth; `verbose_json`
// returns sentence-level `segments[]` with start/end in seconds. Only
// verbose_json is consumed — `stream=true` is deliberately never sent.
export const MINIMAX_DEFAULT_BASE_URL = "https://api.minimaxi.com";
export const MINIMAX_INTERNATIONAL_BASE_URL = "https://api.minimax.io";
export const MINIMAX_MODEL = "asr-1.0";
export const MINIMAX_TRANSCRIBE_TIMEOUT_MS = 120_000;
// Hard provider limits: 500 s and 50 MB per request. The proxy route caps
// bytes tighter; duration is asserted on the parsed response.
export const MINIMAX_MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MINIMAX_MAX_AUDIO_DURATION_MS = 500_000;

export type MinimaxCredentials = {
  apiKey: string;
  baseUrl?: string;
  /** Overridable for tests; production always uses the 120 s default. */
  timeoutMs?: number;
};

export function normalizeMinimaxBaseUrl(value: string | undefined) {
  const trimmed = value?.trim() || MINIMAX_DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return url.origin;
}

/** Maps MiniMax failure signals onto the shared AsrFailureReason taxonomy. */
export function minimaxFailure(status: number | undefined): AsrProviderError {
  if (status === 401 || status === 403)
    return new AsrProviderError("authentication", false);
  // Payment-required: a pay-as-you-go key without balance or an exhausted plan.
  if (status === 402) return new AsrProviderError("quota", false);
  if (status === 429) return new AsrProviderError("capacity", true);
  if (status && status >= 400 && status < 500)
    return new AsrProviderError("configuration", false);
  return new AsrProviderError("network", true);
}

// Domestic deployments surface provider-side codes inside a 200 body
// (base_resp.status_code). The code space differs from HTTP statuses, so
// unknown codes fail closed as configuration instead of being retried.
export function minimaxBodyFailure(code: number): AsrProviderError {
  if (code === 401 || code === 403)
    return new AsrProviderError("authentication", false);
  if (code === 402) return new AsrProviderError("quota", false);
  if (code === 429) return new AsrProviderError("capacity", true);
  return new AsrProviderError("configuration", false);
}

const segmentSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  start: z.number().nonnegative().finite(),
  end: z.number().nonnegative().finite(),
  text: z.string().max(16_000),
  speaker: z.string().max(64).optional(),
});
const responseSchema = z.object({
  text: z.string().max(200_000).optional(),
  duration: z.number().nonnegative().finite().optional(),
  n_speakers: z.number().int().nonnegative().optional(),
  segments: z.array(segmentSchema).max(20_000).optional(),
  // Domestic deployments report success through a 200 body with base_resp.
  base_resp: z
    .object({
      status_code: z.number().int().optional(),
      status_msg: z.string().max(4_000).optional(),
    })
    .optional(),
});
export type MinimaxResponse = z.infer<typeof responseSchema>;

/** verbose_json seconds → session-timeline milliseconds. */
export function mapMinimaxSegments(
  payload: MinimaxResponse,
  startMs: number,
): BatchUtterance[] {
  return (payload.segments ?? [])
    .filter((segment) => segment.text.trim())
    .map((segment) => ({
      startMs: startMs + Math.round(segment.start * 1000),
      endMs: startMs + Math.round(segment.end * 1000),
      text: segment.text.trim(),
      ...(segment.speaker ? { speaker: segment.speaker } : {}),
    }));
}

export function minimaxDurationMs(payload: MinimaxResponse): number {
  if (payload.duration !== undefined)
    return Math.round(payload.duration * 1000);
  const last = (payload.segments ?? []).at(-1);
  return last ? Math.round(last.end * 1000) : 0;
}

const CONTAINER_EXTENSIONS: Record<string, string> = {
  "audio/wav": "audio.wav",
  "audio/x-wav": "audio.wav",
  "audio/wave": "audio.wav",
  "audio/ogg": "audio.ogg",
  "audio/opus": "audio.opus",
  "audio/mpeg": "audio.mp3",
  "audio/mp4": "audio.m4a",
  "audio/aac": "audio.aac",
  "audio/flac": "audio.flac",
  "audio/x-flac": "audio.flac",
};

/** Sniffs the container from magic bytes so the proxy can name the file. */
export function sniffAudioMimeType(bytes: Uint8Array): string | undefined {
  const starts = (...magic: number[]) =>
    magic.every((value, index) => bytes[index] === value);
  const at = (offset: number, ...magic: number[]) =>
    magic.every((value, index) => bytes[offset + index] === value);
  if (bytes.length >= 12 && starts(0x52, 0x49, 0x46, 0x46)) {
    // "WAVE" lives at offset 8 of the RIFF header.
    return at(8, 0x57, 0x41, 0x56, 0x45) ? "audio/wav" : undefined;
  }
  if (bytes.length >= 4 && starts(0x4f, 0x67, 0x67, 0x53)) return "audio/ogg";
  if (bytes.length >= 3 && starts(0x49, 0x44, 0x33)) return "audio/mpeg";
  if (bytes.length >= 2 && starts(0xff, 0xfb)) return "audio/mpeg";
  if (bytes.length >= 4 && starts(0x66, 0x4c, 0x61, 0x43)) return "audio/flac";
  if (bytes.length >= 12 && starts(0, 0, 0, 0x18)) return "audio/mp4";
  return undefined;
}

/** Assembles the speech_to_text multipart body (exported for tests). */
export function buildMinimaxForm(
  audio: ArrayBuffer,
  mimeType = "audio/wav",
): FormData {
  const form = new FormData();
  form.append("model", MINIMAX_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_level", "sentence");
  const extension = CONTAINER_EXTENSIONS[mimeType]?.split(".").at(-1);
  form.append(
    "file",
    new Blob([audio], { type: mimeType }),
    extension ? `audio.${extension}` : "audio.wav",
  );
  return form;
}

export function createMinimaxProvider(
  credentials: MinimaxCredentials,
): BatchAsrProvider {
  const baseUrl = normalizeMinimaxBaseUrl(credentials.baseUrl);
  if (!baseUrl) throw new AsrProviderError("configuration", false);
  const apiKey = credentials.apiKey;
  const timeoutMs = credentials.timeoutMs ?? MINIMAX_TRANSCRIBE_TIMEOUT_MS;
  return {
    id: "minimax",
    async transcribe(
      audio: ArrayBuffer,
      options: BatchTranscribeOptions,
    ): Promise<BatchTranscription> {
      if (audio.byteLength > MINIMAX_MAX_AUDIO_BYTES)
        throw new AsrProviderError("configuration", false);
      const language = options.language?.trim();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      // "auto" (and omission) enables mixed-language recognition; an explicit
      // BCP-47 hint is still the safe default for noisy recordings.
      if (
        language &&
        language !== "auto" &&
        /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)
      )
        headers.language = language;
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      let upstream: Response;
      try {
        upstream = await fetch(`${baseUrl}/v1/speech_to_text`, {
          method: "POST",
          headers,
          body: buildMinimaxForm(
            audio,
            options.mimeType ??
              sniffAudioMimeType(new Uint8Array(audio)) ??
              "audio/wav",
          ),
          signal,
        });
      } catch {
        if (options.signal?.aborted) throw new Error("Capture cancelled");
        throw new AsrProviderError(
          signal.aborted ? "timeout" : "network",
          true,
        );
      }
      if (!upstream.ok) throw minimaxFailure(upstream.status);
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        throw new AsrProviderError("protocol", false);
      }
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) throw new AsrProviderError("protocol", false);
      // A 200 body can still carry a domestic error code; an unknown code
      // from a completed response is a request/credential problem, never a
      // transient network condition.
      const statusCode = parsed.data.base_resp?.status_code;
      if (statusCode && statusCode > 0) throw minimaxBodyFailure(statusCode);
      const utterances = mapMinimaxSegments(parsed.data, options.startMs ?? 0);
      const durationMs = minimaxDurationMs(parsed.data);
      if (durationMs > MINIMAX_MAX_AUDIO_DURATION_MS)
        throw new AsrProviderError("configuration", false);
      return { utterances, durationMs };
    },
  };
}
