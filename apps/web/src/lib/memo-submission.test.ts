import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoCaptureInput } from "./local-memo-capture";
import { validateMemoCaptureSubmission } from "./memo-submission";
import { MAX_COMPRESSION_INPUT_BYTES } from "./upload-compression";
import {
  setAudioCompressionEnabled,
  setImageCompressionEnabled,
} from "./upload-settings";

const t = (key: string) => key;

function input(files: File[]): MemoCaptureInput {
  return { content: "text", visibility: "private", files, tags: [] };
}

const localStorageStore = new Map<string, string>();

/** A canvas that reports WebP encoding support, like Chromium/Firefox do. */
function stubWebpSupport(supported: boolean) {
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      toDataURL: () => (supported ? "data:image/webp,ok" : "data:image/png,ok"),
    }),
  });
}

beforeEach(() => {
  localStorageStore.clear();
  setImageCompressionEnabled(true);
  setAudioCompressionEnabled(true);
  stubWebpSupport(true);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore.set(key, value);
    },
  });
});

describe("validateMemoCaptureSubmission attachment sizing", () => {
  it("accepts an oversized photo the pipeline can shrink", () => {
    const photo = new File([new Uint8Array(30 * 1024 * 1024)], "IMG_0001.jpg", {
      type: "image/jpeg",
    });
    expect(validateMemoCaptureSubmission(input([photo]), t)).toBeUndefined();
  });

  it("rejects an oversized photo this browser cannot shrink", () => {
    // Safari: no WebP encoder, so the file could only fail at the server.
    stubWebpSupport(false);
    const photo = new File([new Uint8Array(30 * 1024 * 1024)], "IMG_0001.jpg", {
      type: "image/jpeg",
    });
    expect(validateMemoCaptureSubmission(input([photo]), t)).toMatchObject({
      message: "toast.attachmentTooLarge",
    });
  });

  it("accepts an oversized lossless recording the pipeline can shrink", () => {
    const take = new File([new Uint8Array(40 * 1024 * 1024)], "take.wav", {
      type: "audio/wav",
    });
    expect(validateMemoCaptureSubmission(input([take]), t)).toBeUndefined();
  });

  it("rejects an oversized file nothing downstream will touch", () => {
    const video = new File([new Uint8Array(30 * 1024 * 1024)], "clip.mp4", {
      type: "video/mp4",
    });
    expect(validateMemoCaptureSubmission(input([video]), t)).toMatchObject({
      message: "toast.attachmentTooLarge",
    });
  });

  it("rejects an oversized image when the image switch is off", () => {
    setImageCompressionEnabled(false);
    const photo = new File([new Uint8Array(30 * 1024 * 1024)], "IMG_0001.jpg", {
      type: "image/jpeg",
    });
    // Off means no transcode, so the server would refuse it anyway: fail here
    // instead of after a long upload.
    expect(validateMemoCaptureSubmission(input([photo]), t)).toMatchObject({
      message: "toast.attachmentTooLarge",
    });
  });

  it("rejects a file too large for the pipeline to buffer", () => {
    const absurd = new File([new Uint8Array(1)], "IMG_0002.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(absurd, "size", {
      value: MAX_COMPRESSION_INPUT_BYTES + 1,
    });
    expect(validateMemoCaptureSubmission(input([absurd]), t)).toMatchObject({
      message: "toast.attachmentTooLarge",
    });
  });

  it("still accepts normal-size attachments", () => {
    const small = new File([new Uint8Array(1024)], "note.txt", {
      type: "text/plain",
    });
    expect(validateMemoCaptureSubmission(input([small]), t)).toBeUndefined();
  });

  it("keeps the other preflight rules", () => {
    expect(
      validateMemoCaptureSubmission(
        { ...input([]), content: "x".repeat(100_001) },
        t,
      ),
    ).toMatchObject({ message: "toast.memoTooLong" });
    const many = Array.from(
      { length: 101 },
      (_, index) =>
        new File([new Uint8Array(1)], `f${index}.txt`, { type: "text/plain" }),
    );
    expect(validateMemoCaptureSubmission(input(many), t)).toMatchObject({
      message: "toast.tooManyAttachments",
    });
  });
});
