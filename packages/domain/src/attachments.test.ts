import { describe, expect, it } from "vitest";
import {
  parseAttachmentDimensions,
  parseAttachmentDuration,
} from "./attachments";

describe("parseAttachmentDuration", () => {
  it("accepts positive whole seconds and numeric strings", () => {
    expect(parseAttachmentDuration(90)).toEqual({ duration: 90 });
    expect(parseAttachmentDuration("42")).toEqual({ duration: 42 });
  });

  it("rejects zero, negative, fractional, and oversized values", () => {
    expect(parseAttachmentDuration(0)).toBeUndefined();
    expect(parseAttachmentDuration(-5)).toBeUndefined();
    expect(parseAttachmentDuration(1.5)).toBeUndefined();
    expect(parseAttachmentDuration(8 * 24 * 60 * 60)).toBeUndefined();
    expect(parseAttachmentDuration("not-a-number")).toBeUndefined();
    expect(parseAttachmentDuration(undefined)).toBeUndefined();
  });
});

describe("parseAttachmentDimensions", () => {
  it("accepts positive integer pixel pairs", () => {
    expect(parseAttachmentDimensions({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(parseAttachmentDimensions({ width: "800", height: "600" })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("requires both halves of the pair", () => {
    expect(
      parseAttachmentDimensions({ width: 800, height: undefined }),
    ).toBeUndefined();
    expect(
      parseAttachmentDimensions({ width: undefined, height: 600 }),
    ).toBeUndefined();
  });

  it("rejects zero, negative, fractional, and absurd values", () => {
    expect(
      parseAttachmentDimensions({ width: 0, height: 600 }),
    ).toBeUndefined();
    expect(
      parseAttachmentDimensions({ width: -1, height: 600 }),
    ).toBeUndefined();
    expect(
      parseAttachmentDimensions({ width: 800.5, height: 600 }),
    ).toBeUndefined();
    expect(
      parseAttachmentDimensions({ width: 999999, height: 600 }),
    ).toBeUndefined();
    expect(
      parseAttachmentDimensions({ width: "wide", height: 600 }),
    ).toBeUndefined();
  });
});
