import { describe, expect, it } from "vitest";
import { extractActiveWikiLinkToken } from "./wikilink-autocomplete";

describe("extractActiveWikiLinkToken", () => {
  it("returns null when no [[ is present", () => {
    expect(extractActiveWikiLinkToken("hello world", 5)).toBeNull();
    expect(extractActiveWikiLinkToken("single [ bracket", 8)).toBeNull();
  });

  it("detects unclosed [[ token with empty query", () => {
    const text = "refer to [[";
    expect(extractActiveWikiLinkToken(text, text.length)).toEqual({
      start: 9,
      query: "",
    });
  });

  it("detects unclosed [[ token with query string", () => {
    const text = "refer to [[my note";
    expect(extractActiveWikiLinkToken(text, text.length)).toEqual({
      start: 9,
      query: "my note",
    });
  });

  it("returns null if [[ is already closed before caret", () => {
    const text = "refer to [[my note]] and more";
    expect(extractActiveWikiLinkToken(text, text.length)).toBeNull();
  });

  it("returns null if newline separates [[ and caret", () => {
    const text = "refer to [[\nline two";
    expect(extractActiveWikiLinkToken(text, text.length)).toBeNull();
  });
});
