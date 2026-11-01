import type { CaptureSentence } from "./types";

/**
 * Joins finalized sentences into flowing plain text for insertion into a
 * draft. Sentences usually carry their own punctuation, so neighbors are
 * glued directly; a space is added only where both sides are letters/digits
 * (i.e. Latin text without sentence punctuation would otherwise merge).
 */
export function joinFinalSentences(sentences: CaptureSentence[]): string {
  return sentences.reduce((acc, sentence) => {
    const text = sentence.text.trim();
    if (!text) return acc;
    if (!acc) return text;
    const glue =
      /\p{L}|\p{N}/u.test(acc[acc.length - 1] ?? "") &&
      /\p{L}|\p{N}/u.test(text[0] ?? "")
        ? " "
        : "";
    return `${acc}${glue}${text}`;
  }, "");
}
