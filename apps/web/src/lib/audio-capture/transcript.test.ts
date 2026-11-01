import { describe, expect, it, vi } from "vitest";
import { toTimestampHrefMarkdown } from "../../lib/transcript";
import {
  CaptureTranscriptAccumulator,
  formatCaptureSentence,
} from "./transcript";
import type { CaptureSentence } from "./types";

function sentence(index: number): CaptureSentence {
  return {
    id: `sentence-${index}`,
    text: `text-${index}`,
    final: true,
    receivedAt: index * 1000,
  };
}

describe("capture transcript accumulator", () => {
  it("formats only newly finalized sentences", () => {
    const format = vi.fn((value: CaptureSentence) => value.text);
    const accumulator = new CaptureTranscriptAccumulator(format);
    const sentences = [sentence(0)];

    expect(accumulator.sync(sentences, 100)).toBe("text-0");
    expect(accumulator.sync(sentences, 100)).toBe("text-0");
    sentences.push(sentence(1), sentence(2));
    expect(accumulator.sync(sentences, 100)).toBe("text-0\n\ntext-1\n\ntext-2");
    expect(format.mock.calls.map(([value]) => value.id)).toEqual([
      "sentence-0",
      "sentence-1",
      "sentence-2",
    ]);
  });

  it("resets for a new capture and keeps 4,000 appends linear", () => {
    const format = vi.fn((value: CaptureSentence) => value.text);
    const accumulator = new CaptureTranscriptAccumulator(format);
    const sentences: CaptureSentence[] = [];
    let text = "";

    for (let index = 0; index < 4000; index += 1) {
      sentences.push(sentence(index));
      text = accumulator.sync(sentences, 100);
    }
    expect(format).toHaveBeenCalledTimes(4000);
    expect(text.startsWith("text-0\n\ntext-1")).toBe(true);
    expect(text.endsWith("text-3999")).toBe(true);

    expect(accumulator.sync([sentence(9)], 200)).toBe("text-9");
    expect(format).toHaveBeenCalledTimes(4001);
  });
});

describe("capture sentence clock markers (rollout §4.2)", () => {
  it("marks each sentence with its session-relative clock", () => {
    // Batch utterances carry startedAt on the session timeline directly.
    expect(
      formatCaptureSentence(
        {
          id: "a",
          text: "hello",
          final: true,
          startedAt: 75_000,
          receivedAt: 1_076_000,
        },
        1_000_000,
      ),
    ).toBe("[01:15] hello");
    // Streaming sentences fall back to the receive wall-clock minus start.
    expect(
      formatCaptureSentence(
        { id: "b", text: "hello", final: true, receivedAt: 1_075_000 },
        1_000_000,
      ),
    ).toBe("[01:15] hello");
    // Past the hour the clock grows an hours field (still parser-valid).
    expect(
      formatCaptureSentence(
        {
          id: "c",
          text: "late",
          final: true,
          startedAt: 3_700_000,
          receivedAt: 3_700_500,
        },
        0,
      ),
    ).toBe("[01:01:40] late");
    // Negative drift never renders a negative clock.
    expect(
      formatCaptureSentence(
        { id: "d", text: "early", final: true, receivedAt: 900 },
        1_000,
      ),
    ).toBe("[00:00] early");
  });

  it("produces bodies the reading view turns into seek links", () => {
    const accumulator = new CaptureTranscriptAccumulator();
    const body = accumulator.sync(
      [
        {
          id: "s0",
          text: "第一句",
          final: true,
          startedAt: 750_000,
          receivedAt: 750_500,
        },
        {
          id: "s1",
          text: "第二句",
          final: true,
          startedAt: 4_350_000,
          receivedAt: 4_350_500,
        },
      ],
      1_000_000,
    );
    expect(body).toBe("[12:30] 第一句\n\n[01:12:30] 第二句");
    expect(toTimestampHrefMarkdown(body).split("\n")).toEqual([
      "[12:30](#flaremo-t=750) 第一句",
      "",
      "[01:12:30](#flaremo-t=4350) 第二句",
    ]);
  });
});
