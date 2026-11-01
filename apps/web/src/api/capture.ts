import { apiRequest } from "./client";

export type CaptureStatus = {
  available: boolean;
  provider: string | null;
  streaming: boolean;
  /** Voice capability mode (rollout §3.3): live streaming or batch ASR. */
  kind: "streaming" | "batch" | null;
};

export async function getCaptureStatus() {
  return apiRequest<CaptureStatus>("/api/app/capture/status");
}

export type CaptureUtterance = {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
};
export type CaptureTranscription = {
  utterances: CaptureUtterance[];
  durationMs: number;
};

// Batch ASR slice upload (rollout §3.2): raw octet-stream body, the Worker
// proxies to MiniMax so the API key never reaches the browser.
export async function transcribeCaptureChunk(
  audio: ArrayBuffer,
  input: {
    startMs: number;
    language: string;
    format: "opus" | "wav";
    signal?: AbortSignal;
  },
) {
  const query = new URLSearchParams({
    startMs: String(input.startMs),
    language: input.language,
    format: input.format,
  });
  return apiRequest<CaptureTranscription>(
    `/api/app/capture/transcribe?${query.toString()}`,
    {
      method: "POST",
      body: audio,
      headers: { "content-type": "application/octet-stream" },
      ...(input.signal ? { signal: input.signal } : {}),
    },
  );
}
