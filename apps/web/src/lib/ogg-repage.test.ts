import { describe, expect, it } from "vitest";
import { repageOggOpus } from "./ogg-repage";

/**
 * The repager is verified against bytes from the real libopus WASM muxer, not
 * a mock: the properties that matter (packets preserved, granules preserved,
 * CRCs valid) are only meaningful on a genuine stream. The module loads as a
 * single JS file with the wasm embedded, so this runs under Node unchanged.
 */
async function encodeOgg(input: {
  seconds: number;
  sampleRate: number;
  channels: number;
  bitrate?: number;
}): Promise<Uint8Array> {
  const { default: createOpus } = await import("@audio/encode-opus");
  const encoder = await createOpus({
    sampleRate: input.sampleRate,
    channels: input.channels,
    bitrate: input.bitrate ?? (input.channels === 2 ? 96 : 32),
    application: input.channels === 2 ? "audio" : "voip",
  });
  const parts: Uint8Array[] = [];
  const chunk = input.sampleRate;
  const total = input.seconds * input.sampleRate;
  try {
    for (let offset = 0; offset < total; offset += chunk) {
      const length = Math.min(chunk, total - offset);
      const frames: Float32Array[] = [];
      for (let channel = 0; channel < input.channels; channel += 1) {
        const data = new Float32Array(length);
        for (let index = 0; index < length; index += 1) {
          data[index] =
            Math.sin(
              (2 * Math.PI * (440 + channel * 110) * (offset + index)) /
                input.sampleRate,
            ) * 0.4;
        }
        frames.push(data);
      }
      parts.push(new Uint8Array(encoder.encode(frames)));
    }
    parts.push(new Uint8Array(encoder.flush()));
  } finally {
    encoder.free();
  }
  const total_bytes = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total_bytes);
  let cursor = 0;
  for (const part of parts) {
    joined.set(part, cursor);
    cursor += part.byteLength;
  }
  return joined;
}

type ParsedPage = {
  flags: number;
  granule: number;
  sequence: number;
  crc: number;
  packets: Uint8Array[];
};

function parse(bytes: Uint8Array): ParsedPage[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pages: ParsedPage[] = [];
  let offset = 0;
  while (offset + 27 <= bytes.byteLength) {
    expect(String.fromCharCode(...bytes.subarray(offset, offset + 4))).toBe(
      "OggS",
    );
    expect(bytes[offset + 4]).toBe(0);
    const segmentCount = bytes[offset + 26];
    const bodyOffset = offset + 27 + segmentCount;
    const packets: Uint8Array[] = [];
    let cursor = bodyOffset;
    let pending = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      const size = bytes[offset + 27 + index];
      pending += size;
      if (size < 255) {
        packets.push(bytes.subarray(cursor, cursor + pending));
        cursor += pending;
        pending = 0;
      }
    }
    pages.push({
      flags: bytes[offset + 5],
      granule:
        view.getUint32(offset + 6, true) +
        view.getUint32(offset + 10, true) * 2 ** 32,
      sequence: view.getUint32(offset + 18, true),
      crc: view.getUint32(offset + 22, true),
      packets,
    });
    offset =
      bodyOffset + packets.reduce((sum, packet) => sum + packet.byteLength, 0);
  }
  expect(offset).toBe(bytes.byteLength);
  return pages;
}

/** Same CRC the muxer uses (poly 0x04C11DB7, init 0, no final xor). */
function crc32(bytes: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let remainder = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder =
        remainder & 0x80000000 ? (remainder << 1) ^ 0x04c11db7 : remainder << 1;
      remainder >>>= 0;
    }
    table[index] = remainder >>> 0;
  }
  let crc = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = ((crc << 8) ^ table[((crc >>> 24) ^ bytes[index]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

/** Every packet in the stream, in order — the property that must not change. */
function packetsOf(pages: ParsedPage[]): string[] {
  return pages.flatMap((page) =>
    page.packets.map((packet) =>
      Array.from(packet, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    ),
  );
}

describe("repageOggOpus", () => {
  it("merges one-packet pages into ~1 s pages without touching the packets", async () => {
    const source = await encodeOgg({
      seconds: 3,
      sampleRate: 16_000,
      channels: 1,
    });
    const sourcePages = parse(source);
    // The muxer's own layout: the header pair plus one page per 20 ms frame,
    // and its flush pads one extra frame so the pre-skip lands exactly.
    expect(sourcePages.length).toBe(2 + 151);

    const merged = repageOggOpus(source);
    expect(merged).not.toBeNull();
    const mergedPages = parse(merged as Uint8Array);
    // 151 audio packets at 50 per second become four pages.
    expect(mergedPages.length).toBe(2 + 4);
    expect((merged as Uint8Array).byteLength).toBeLessThan(source.byteLength);

    expect(packetsOf(mergedPages)).toEqual(packetsOf(sourcePages));
  });

  it("keeps the header pages verbatim and the duration granule intact", async () => {
    const source = await encodeOgg({
      seconds: 3,
      sampleRate: 16_000,
      channels: 1,
    });
    const sourcePages = parse(source);
    const merged = repageOggOpus(source) as Uint8Array;
    const mergedPages = parse(merged);

    expect(mergedPages[0].packets).toHaveLength(1);
    expect(
      new TextDecoder().decode(mergedPages[0].packets[0].slice(0, 8)),
    ).toBe("OpusHead");
    expect(mergedPages[0].flags & 0x02).toBe(0x02);
    expect(mergedPages[1].packets).toHaveLength(1);
    expect(
      new TextDecoder().decode(mergedPages[1].packets[0].slice(0, 8)),
    ).toBe("OpusTags");

    const last = mergedPages[mergedPages.length - 1];
    expect(last.flags & 0x04).toBe(0x04);
    expect(last.granule).toBe(sourcePages[sourcePages.length - 1].granule);
    // Sequence numbers stay contiguous from zero, or demuxers reject the stream.
    expect(mergedPages.map((page) => page.sequence)).toEqual(
      mergedPages.map((_, index) => index),
    );
  });

  it("writes valid CRCs on every rebuilt page", async () => {
    const source = await encodeOgg({
      seconds: 2,
      sampleRate: 48_000,
      channels: 2,
    });
    const merged = repageOggOpus(source) as Uint8Array;
    // Re-walk manually so the CRC field can be zeroed and recomputed.
    let offset = 0;
    let pages = 0;
    while (offset + 27 <= merged.byteLength) {
      const segmentCount = merged[offset + 26];
      let payload = 0;
      for (let index = 0; index < segmentCount; index += 1) {
        payload += merged[offset + 27 + index];
      }
      const size = 27 + segmentCount + payload;
      const page = merged.slice(offset, offset + size);
      const stored = new DataView(page.buffer).getUint32(22, true);
      const forCrc = page.slice();
      new DataView(forCrc.buffer).setUint32(22, 0, true);
      expect(stored).toBe(crc32(forCrc));
      offset += size;
      pages += 1;
    }
    expect(offset).toBe(merged.byteLength);
    expect(pages).toBeGreaterThan(2);
  });

  it("handles packets that need more than one lacing segment", async () => {
    // 96 kbps stereo frames can exceed 255 bytes; the lacing table must then
    // span several segments per packet.
    const source = await encodeOgg({
      seconds: 2,
      sampleRate: 48_000,
      channels: 2,
      bitrate: 160,
    });
    const sourcePages = parse(source);
    const seen = sourcePages.some((page) =>
      page.packets.some((packet) => packet.byteLength > 255),
    );
    expect(seen).toBe(true);

    const merged = repageOggOpus(source) as Uint8Array;
    expect(packetsOf(parse(merged))).toEqual(packetsOf(sourcePages));
  });

  it("returns null instead of guessing when the bytes are not our layout", async () => {
    expect(repageOggOpus(new Uint8Array(0))).toBeNull();
    expect(repageOggOpus(new Uint8Array([0x4f, 0x67, 0x67]))).toBeNull();
    expect(repageOggOpus(new Uint8Array(512).fill(0x41))).toBeNull();

    // A truncated stream: the last page claims bytes the buffer does not hold.
    const source = await encodeOgg({
      seconds: 2,
      sampleRate: 16_000,
      channels: 1,
    });
    expect(repageOggOpus(source.slice(0, source.byteLength - 30))).toBeNull();

    // Valid Ogg, but not an Opus stream (no OpusHead first packet).
    const notOpus = new Uint8Array(source);
    notOpus.set([0x58, 0x58, 0x58, 0x58], source.indexOf(0x4f));
    expect(repageOggOpus(notOpus)).toBeNull();

    // Already merged: merging again cannot shrink it, so the original is kept.
    const merged = repageOggOpus(source) as Uint8Array;
    expect(repageOggOpus(merged)).toBeNull();
  });

  it("shrinks most at low bitrates, where page headers dominate", async () => {
    const low = await encodeOgg({
      seconds: 10,
      sampleRate: 16_000,
      channels: 1,
      bitrate: 8,
    });
    const high = await encodeOgg({
      seconds: 10,
      sampleRate: 16_000,
      channels: 1,
      bitrate: 96,
    });
    const lowMerged = repageOggOpus(low) as Uint8Array;
    const highMerged = repageOggOpus(high) as Uint8Array;
    const lowSaving = 1 - lowMerged.byteLength / low.byteLength;
    const highSaving = 1 - highMerged.byteLength / high.byteLength;
    expect(lowSaving).toBeGreaterThan(0.5);
    expect(highSaving).toBeGreaterThan(0.08);
    expect(lowSaving).toBeGreaterThan(highSaving);
  });
});
