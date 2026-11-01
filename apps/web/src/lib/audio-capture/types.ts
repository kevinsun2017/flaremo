export type CaptureState =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "recording"
  | "paused"
  | "reconnecting"
  | "stopping"
  /** Batch ASR: audio recorded, waiting for the provider (rollout §3.3). */
  | "transcribing"
  | "review"
  | "error";

import type { CaptureSentenceEvent } from "@flaremo/contracts";

export type CaptureSentence = Omit<CaptureSentenceEvent, "type">;
