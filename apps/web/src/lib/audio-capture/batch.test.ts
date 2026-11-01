import { afterEach, describe, expect, it, vi } from "vitest";
import { type BatchProgress, transcribeCapturedAudio } from "./batch";
import type { CapturedAudio } from "./encoder";

const transcribe = vi.fn();
vi.mock("../../api", () => ({
  transcribeCaptureChunk: (...args: unknown[]) => transcribe(...args),
}));

function audio(
  slices: {
    startMs: number;
    utterances: { startMs: number; text: string }[];
  }[],
): CapturedAudio {
  return {
    mimeType: "audio/wav",
    slices: slices.map(({ startMs, utterances }) => ({
      blob: new Blob([JSON.stringify({ startMs, utterances })]),
      startMs,
    })),
  };
}

const utterance = (startMs: number, text: string) => ({ startMs, text });

afterEach(() => {
  transcribe.mockReset();
});

describe("batch transcription runner", () => {
  it("uploads slices in order and stitches the server-offset utterances", async () => {
    transcribe.mockImplementation((_blob, input) =>
      Promise.resolve({
        utterances:
          input.startMs === 0
            ? [utterance(0, "你好"), utterance(1200, "世界")]
            : [utterance(480_100, "second")],
        durationMs: 480_000,
      }),
    );
    const progress: BatchProgress[] = [];
    const sentences = await transcribeCapturedAudio(
      audio([
        { startMs: 0, utterances: [] },
        { startMs: 480_000, utterances: [] },
      ]),
      {
        language: "zh",
        startedAtMs: 1_000,
        onProgress: (value) => progress.push(value),
      },
    );
    expect(transcribe.mock.calls.map(([, input]) => input.startMs)).toEqual([
      0, 480_000,
    ]);
    expect(
      transcribe.mock.calls.map(
        ([, input]) => (input as { format: string }).format,
      ),
    ).toEqual(["wav", "wav"]);
    expect(progress).toEqual([
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
    expect(sentences.map((s) => s.text)).toEqual(["你好", "世界", "second"]);
    expect(sentences[2]).toMatchObject({
      final: true,
      startedAt: 480_100,
      receivedAt: 481_100,
    });
  });

  it("retries a failed slice exactly once", async () => {
    transcribe.mockRejectedValueOnce(new Error("502")).mockResolvedValue({
      utterances: [utterance(0, "recovered")],
      durationMs: 1,
    });
    const sentences = await transcribeCapturedAudio(
      audio([{ startMs: 0, utterances: [] }]),
      { language: "zh", startedAtMs: 0 },
    );
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(sentences.map((s) => s.text)).toEqual(["recovered"]);
  });

  it("fails the session after the single retry fails again", async () => {
    transcribe.mockRejectedValue(new Error("502"));
    await expect(
      transcribeCapturedAudio(audio([{ startMs: 0, utterances: [] }]), {
        language: "zh",
        startedAtMs: 0,
      }),
    ).rejects.toThrow();
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("stops uploading once the abort signal fires", async () => {
    transcribe.mockResolvedValue({ utterances: [], durationMs: 1 });
    const controller = new AbortController();
    await transcribeCapturedAudio(
      audio([
        { startMs: 0, utterances: [] },
        { startMs: 480_000, utterances: [] },
      ]),
      { language: "zh", startedAtMs: 0, signal: controller.signal },
    );
    controller.abort();
    await expect(
      transcribeCapturedAudio(audio([{ startMs: 0, utterances: [] }]), {
        language: "zh",
        startedAtMs: 0,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Capture cancelled");
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
});
