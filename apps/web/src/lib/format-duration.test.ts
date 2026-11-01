import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("zero-pads every field", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(5)).toBe("00:00:05");
    expect(formatDuration(65)).toBe("00:01:05");
    expect(formatDuration(3725)).toBe("01:02:05");
  });

  it("does not wrap the hour field at a day", () => {
    expect(formatDuration(86_400)).toBe("24:00:00");
    expect(formatDuration(360_000)).toBe("100:00:00");
  });

  it("truncates fractional seconds instead of rounding up", () => {
    expect(formatDuration(59.9)).toBe("00:00:59");
  });
});
