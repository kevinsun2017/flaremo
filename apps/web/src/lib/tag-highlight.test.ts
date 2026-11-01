import { describe, expect, it } from "vitest";
import { findTagRanges } from "./tag-highlight";

describe("findTagRanges", () => {
  it("finds a single tag including the hash", () => {
    expect(findTagRanges("#生活")).toEqual([[0, 3]]);
  });

  it("finds multiple tags on one line", () => {
    const ranges = findTagRanges("今天 #跑步 和 #workout");
    expect(ranges).toEqual([
      [3, 6],
      [9, 17],
    ]);
  });

  it("does not fire inside words or numbers", () => {
    expect(findTagRanges("v1.2#12 abc#def")).toEqual([]);
  });

  it("fires after punctuation that opens a run", () => {
    expect(findTagRanges("(#标签")).toEqual([[1, 4]]);
  });

  it("returns nothing for plain text", () => {
    expect(findTagRanges("no tags here")).toEqual([]);
  });
});
