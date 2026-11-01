import { formatClock } from "../../lib/transcript";
import type { CaptureSentence } from "./types";

export type CaptureSentenceFormatter = (sentence: CaptureSentence) => string;

/**
 * Session-relative clock marker for a finalized sentence (rollout §4.2):
 * `[mm:ss] text`, or `[hh:mm:ss]` past the hour. Batch utterances carry their
 * `startedAt` directly on the session timeline; streaming sentences fall back
 * to the receive wall-clock minus the session start. `lib/transcript.ts`
 * parses exactly this leading-marker shape into clickable seek anchors once
 * the memo gains an audio attachment.
 */
export function formatCaptureSentence(
  sentence: CaptureSentence,
  sessionStartedAtMs: number,
): string {
  const offsetMs =
    sentence.startedAt ?? sentence.receivedAt - sessionStartedAtMs;
  const seconds = Math.max(0, Math.floor(offsetMs / 1000));
  return `[${formatClock(seconds)}] ${sentence.text}`;
}

/** Keeps live transcript work proportional to newly finalized sentences. */
export class CaptureTranscriptAccumulator {
  private startedAt: number | null = null;
  private sentenceCount = 0;
  private text = "";
  private readonly formatSentence: CaptureSentenceFormatter;

  constructor(
    formatSentence: CaptureSentenceFormatter = (sentence) =>
      formatCaptureSentence(sentence, this.startedAt ?? 0),
  ) {
    this.formatSentence = formatSentence;
  }

  sync(
    sentences: CaptureSentence[],
    startedAt: number,
    finalizedCount = sentences.length,
  ) {
    const nextCount = Math.min(finalizedCount, sentences.length);
    if (this.startedAt !== startedAt || nextCount < this.sentenceCount) {
      this.sentenceCount = 0;
      this.text = "";
    }
    this.startedAt = startedAt;

    const added = sentences
      .slice(this.sentenceCount, nextCount)
      .map(this.formatSentence)
      .join("\n\n");
    if (added) this.text = this.text ? `${this.text}\n\n${added}` : added;
    this.sentenceCount = nextCount;
    return this.text;
  }

  reset() {
    this.startedAt = null;
    this.sentenceCount = 0;
    this.text = "";
  }
}
