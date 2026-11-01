import { describe, expect, it } from "vitest";
import {
  countTaskItems,
  memoTaskLines,
  toggleMemoTaskLine,
} from "./memo-tasks";

describe("memoTaskLines", () => {
  it("finds task lines with their 0-based index and text", () => {
    const content = [
      "# Shopping",
      "",
      "- [ ] milk",
      "- [x] eggs",
      "  - [ ] nested item",
      "1. [X] numbered done",
      "plain line",
    ].join("\n");
    expect(memoTaskLines(content)).toEqual([
      { checked: false, lineIndex: 2, text: "milk" },
      { checked: true, lineIndex: 3, text: "eggs" },
      { checked: false, lineIndex: 4, text: "nested item" },
      { checked: true, lineIndex: 5, text: "numbered done" },
    ]);
  });

  it("ignores look-alikes that are not task items", () => {
    expect(memoTaskLines("-[ ] no space after marker")).toEqual([]);
    expect(memoTaskLines("- no checkbox here")).toEqual([]);
  });
});

describe("toggleMemoTaskLine", () => {
  const content = ["- [ ] milk", "text", "- [x] eggs"].join("\n");

  it("checks an unchecked line in place", () => {
    expect(toggleMemoTaskLine(content, 0)).toBe(
      ["- [x] milk", "text", "- [x] eggs"].join("\n"),
    );
  });

  it("unchecks a checked line in place", () => {
    expect(toggleMemoTaskLine(content, 2)).toBe(
      ["- [ ] milk", "text", "- [ ] eggs"].join("\n"),
    );
  });

  it("preserves the marker style and rest of the line", () => {
    expect(toggleMemoTaskLine("* [ ] milk #tag", 0)).toBe("* [x] milk #tag");
    expect(toggleMemoTaskLine("1. [x] step", 0)).toBe("1. [ ] step");
  });

  it("returns null for non-task lines and out-of-range indexes", () => {
    expect(toggleMemoTaskLine(content, 1)).toBeNull();
    expect(toggleMemoTaskLine(content, 99)).toBeNull();
    expect(toggleMemoTaskLine("- no checkbox", 0)).toBeNull();
  });
});

describe("countTaskItems", () => {
  it("counts task items in document order", () => {
    expect(countTaskItems("- [ ] a\n- [x] b\ntext\n- [ ] c")).toBe(3);
    expect(countTaskItems("no tasks here")).toBe(0);
    expect(countTaskItems("- [] no checkbox mark")).toBe(0);
    expect(countTaskItems("- [ ] extra pair brackets")).toBe(1);
  });
});
