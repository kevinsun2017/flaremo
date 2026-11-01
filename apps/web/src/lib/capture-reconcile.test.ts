import type { LocalCapture } from "@flaremo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateMemoRequest, Memo } from "@/api";
import {
  captureMemoMatchesInput,
  createOrReconcileCaptureMemo,
  mergeCaptureSnapshot,
  normalizedCaptureTags,
} from "./capture-reconcile";

const createMemo = vi.fn();
const updateMemo = vi.fn();
vi.mock("@/api", () => ({
  createMemo: (...args: unknown[]) => createMemo(...args),
  updateMemo: (...args: unknown[]) => updateMemo(...args),
}));

afterEach(() => {
  createMemo.mockReset();
  updateMemo.mockReset();
});

function memo(overrides: Partial<Memo> = {}): Memo {
  return {
    name: "memos/1",
    id: "1",
    content: "hello",
    visibility: "private",
    state: "normal",
    pinned: false,
    payload: {},
    create_time: "2026-09-20T00:00:00Z",
    update_time: "2026-09-20T00:00:00Z",
    display_time: "2026-09-20T00:00:00Z",
    creator: "users/1",
    ...overrides,
  };
}

function input(overrides: Partial<CreateMemoRequest> = {}): CreateMemoRequest {
  return {
    content: "hello",
    visibility: "private",
    source: "voice",
    payload: { tags: ["voice"], client_id: "c1" },
    ...overrides,
  };
}

function capture(overrides: Partial<LocalCapture> = {}): LocalCapture {
  return {
    version: 1,
    clientId: "c1",
    text: "old",
    startedAt: 1_000,
    duration: 0,
    tags: ["voice"],
    visibility: "private",
    gap: false,
    ...overrides,
  };
}

describe("mergeCaptureSnapshot", () => {
  it("returns the stored value unchanged when the capture never started", () => {
    const value = capture();
    expect(mergeCaptureSnapshot(value, "next", null, null, true)).toBe(value);
  });

  it("folds text, start time and duration into the draft", () => {
    const merged = mergeCaptureSnapshot(
      capture(),
      "hello world",
      1_000,
      66_000,
      true,
    );
    expect(merged).toEqual({
      ...capture(),
      text: "hello world",
      startedAt: 1_000,
      duration: 65,
      gap: true,
    });
  });

  it("measures against now while still recording", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(31_000);
      expect(
        mergeCaptureSnapshot(capture(), "live", 1_000, null, false),
      ).toMatchObject({ duration: 30 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("never reports a negative duration", () => {
    expect(
      mergeCaptureSnapshot(capture(), "clock skew", 60_000, 1_000, false),
    ).toMatchObject({ duration: 0 });
  });
});

describe("normalizedCaptureTags", () => {
  it("deduplicates and sorts tags", () => {
    expect(
      normalizedCaptureTags(input({ payload: { tags: ["b", "a", "b", "a"] } })),
    ).toEqual(["a", "b"]);
  });

  it("treats a missing tag list as empty", () => {
    expect(normalizedCaptureTags(input({ payload: {} }))).toEqual([]);
    expect(normalizedCaptureTags(input({ payload: undefined }))).toEqual([]);
  });
});

describe("captureMemoMatchesInput", () => {
  it("matches on content, visibility and the normalized tag set", () => {
    expect(
      captureMemoMatchesInput(
        memo({ payload: { tags: ["voice", "voice"] } }),
        input(),
      ),
    ).toBe(true);
  });

  it("differs when content, visibility or tags changed", () => {
    expect(captureMemoMatchesInput(memo({ content: "other" }), input())).toBe(
      false,
    );
    expect(
      captureMemoMatchesInput(memo({ visibility: "public" }), input()),
    ).toBe(false);
    expect(
      captureMemoMatchesInput(memo({ payload: { tags: ["other"] } }), input()),
    ).toBe(false);
    expect(captureMemoMatchesInput(memo({ payload: {} }), input())).toBe(false);
  });
});

describe("createOrReconcileCaptureMemo", () => {
  it("returns the created memo when it already matches", async () => {
    createMemo.mockResolvedValue(memo({ payload: { tags: ["voice"] } }));
    await expect(createOrReconcileCaptureMemo(input(), null)).resolves.toEqual(
      memo({ payload: { tags: ["voice"] } }),
    );
    expect(updateMemo).not.toHaveBeenCalled();
  });

  it("rewrites the row when a retry re-sends newer content", async () => {
    const created = memo({ payload: { tags: ["voice"], client_id: "c1" } });
    const updated = memo({
      content: "hello again",
      payload: { tags: ["voice"], client_id: "c1" },
    });
    createMemo.mockResolvedValue(created);
    updateMemo.mockResolvedValue(updated);
    const previous = input();

    await expect(
      createOrReconcileCaptureMemo(input({ content: "hello again" }), previous),
    ).resolves.toEqual(updated);
    expect(updateMemo).toHaveBeenCalledWith("1", {
      content: "hello again",
      visibility: "private",
      payload: { tags: ["voice"], client_id: "c1" },
    });
  });

  it("refuses a row another client id owns", async () => {
    createMemo.mockResolvedValue(
      memo({ content: "made elsewhere", payload: { client_id: "other" } }),
    );
    await expect(
      createOrReconcileCaptureMemo(input(), input()),
    ).rejects.toThrow("Capture memo changed after its initial save");
    expect(updateMemo).not.toHaveBeenCalled();
  });

  it("refuses when there is no previous attempt to compare against", async () => {
    createMemo.mockResolvedValue(
      memo({ content: "made elsewhere", payload: { client_id: "c1" } }),
    );
    await expect(createOrReconcileCaptureMemo(input(), null)).rejects.toThrow(
      "Capture memo changed after its initial save",
    );
  });

  it("refuses when the row moved past the previous attempt", async () => {
    createMemo.mockResolvedValue(
      memo({ content: "edited in another tab", payload: { client_id: "c1" } }),
    );
    await expect(
      createOrReconcileCaptureMemo(input(), input()),
    ).rejects.toThrow("Capture memo changed after its initial save");
    expect(updateMemo).not.toHaveBeenCalled();
  });
});
