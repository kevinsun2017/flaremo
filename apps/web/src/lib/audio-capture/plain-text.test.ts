import { describe, expect, it } from "vitest";
import { joinFinalSentences } from "./plain-text";
import type { CaptureSentence } from "./types";

function sentence(text: string): CaptureSentence {
  return {
    id: text,
    text,
    final: true,
    receivedAt: 0,
  };
}

describe("joinFinalSentences", () => {
  it("glues punctuated sentences directly", () => {
    expect(
      joinFinalSentences([sentence("今天天气不错。"), sentence("适合散步。")]),
    ).toBe("今天天气不错。适合散步。");
  });

  it("separates unpunctuated latin neighbors with a space", () => {
    expect(
      joinFinalSentences([sentence("hello world"), sentence("again")]),
    ).toBe("hello world again");
  });

  it("drops empty sentences", () => {
    expect(joinFinalSentences([sentence(""), sentence("ok。")])).toBe("ok。");
  });
});
