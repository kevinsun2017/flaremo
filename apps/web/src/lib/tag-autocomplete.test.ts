import { describe, expect, it } from "vitest";
import {
  extractActiveTagToken,
  filterTagSuggestions,
} from "./tag-autocomplete";

describe("extractActiveTagToken", () => {
  it("finds the token the caret sits in", () => {
    expect(extractActiveTagToken("#foo bar", 4)).toEqual({
      start: 0,
      token: "foo",
    });
    expect(extractActiveTagToken("hi #思考", 8)).toEqual({
      start: 3,
      token: "思考",
    });
    expect(extractActiveTagToken("#a", 2)).toEqual({ start: 0, token: "a" });
  });

  it("returns an empty token right after typing #", () => {
    expect(extractActiveTagToken("hello #", 7)).toEqual({
      start: 6,
      token: "",
    });
  });

  it("stays silent once a space follows", () => {
    expect(extractActiveTagToken("#tag ", 5)).toBeNull();
    expect(extractActiveTagToken("#tag done", 9)).toBeNull();
  });

  it("ignores a hash that is not a tag start", () => {
    expect(extractActiveTagToken("https://a#b", 11)).toBeNull();
    expect(extractActiveTagToken("abc#tag", 7)).toBeNull();
  });
});

describe("filterTagSuggestions", () => {
  const tags = [
    { name: "工作", count: 5 },
    { name: "工作复盘", count: 3 },
    { name: "阅读", count: 9 },
    { name: "灵感", count: 2 },
  ];

  it("prefers prefix matches ranked by count", () => {
    expect(filterTagSuggestions(tags, "工作")).toEqual([
      { name: "工作", count: 5 },
      { name: "工作复盘", count: 3 },
    ]);
  });

  it("falls back to substring matches", () => {
    expect(filterTagSuggestions(tags, "作复")).toEqual([
      { name: "工作复盘", count: 3 },
    ]);
  });

  it("puts the exact match first", () => {
    expect(filterTagSuggestions(tags, "灵感")).toEqual([
      { name: "灵感", count: 2 },
    ]);
  });

  it("lists the top tags for an empty token", () => {
    expect(filterTagSuggestions(tags, "", 2).map((tag) => tag.name)).toEqual([
      "阅读",
      "工作",
    ]);
  });
});
