/**
 * Ogg page consolidation for our own Opus muxer's output.
 *
 * `@audio/encode-opus` writes one Ogg page per 20 ms packet: 28 header bytes
 * around a 60-byte payload at 24 kbps, i.e. a third of the file is page
 * headers, and 150 pages per 3 s. Two measured costs (2026-09-19, three
 * engines, docs/audio-compression-research.md §7):
 *
 * - Size: at our mono bitrates the headers are 24–55% of the payload. Merging
 *   ~1 s of packets into one page recovers all of it (12 747 vs 16 716 bytes
 *   for 3 s of 32 kbps mono).
 * - Duration: WebKit estimates the length of a one-packet-per-page stream from
 *   its byte rate and overshoots badly (4.04 s reported for a 3.006 s file at
 *   32 kbps, 7.52 s at 8 kbps); with ~1 s pages the same bytes report
 *   3.04–3.28 s. Chromium and Firefox were exact either way, so this is a
 *   WebKit demuxer quirk, not a container defect — but the uploader's own
 *   browser is what writes the duration we store, so it matters.
 *
 * The rewrite is lossless: same packets, same order, same granules, recomputed
 * CRC and sequence numbers; ffmpeg decodes byte-identical PCM before and after.
 */

const HEADER_BYTES = 27;
const MAX_SEGMENTS = 255;
const MAX_SEGMENT_BYTES = 255;
/** Page target: one second of 48 kHz audio, in granule units. */
const TARGET_PAGE_GRANULE = 48_000;
const CRC_POLYNOMIAL = 0x04c11db7;

type SourcePage = {
  flags: number;
  granule: number;
  serial: number;
  packets: Uint8Array[];
};

function readGranule(view: DataView, offset: number): number {
  return (
    view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = offset; index < offset + length; index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}

/** Walks the page/packet structure, or null if the bytes are not a clean stream. */
function parsePages(bytes: Uint8Array): SourcePage[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pages: SourcePage[] = [];
  let offset = 0;
  while (offset + HEADER_BYTES <= bytes.byteLength) {
    if (ascii(bytes, offset, 4) !== "OggS") return null;
    const segmentCount = bytes[offset + 26];
    const bodyOffset = offset + HEADER_BYTES + segmentCount;
    if (segmentCount === 0 || bodyOffset > bytes.byteLength) return null;

    // A packet is the run of lacing values up to and including the first one
    // below 255; a value of exactly 255 means the packet continues.
    const packets: Uint8Array[] = [];
    let cursor = bodyOffset;
    let pending = 0;
    let payloadBytes = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      const size = bytes[offset + HEADER_BYTES + index];
      payloadBytes += size;
      pending += size;
      if (size < MAX_SEGMENT_BYTES) {
        if (cursor + pending > bytes.byteLength) return null;
        packets.push(bytes.subarray(cursor, cursor + pending));
        cursor += pending;
        pending = 0;
      }
    }
    // A page ending mid-packet needs continuation handling that merging would
    // have to reproduce, so such a stream is left alone.
    if (pending > 0) return null;

    pages.push({
      flags: bytes[offset + 5],
      granule: readGranule(view, offset + 6),
      serial: view.getUint32(offset + 14, true),
      packets,
    });
    offset = bodyOffset + payloadBytes;
  }
  if (offset !== bytes.byteLength) return null;
  return pages.length > 0 ? pages : null;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let remainder = index << 24;
      for (let bit = 0; bit < 8; bit += 1) {
        remainder =
          remainder & 0x80000000
            ? (remainder << 1) ^ CRC_POLYNOMIAL
            : remainder << 1;
        remainder >>>= 0;
      }
      crcTable[index] = remainder >>> 0;
    }
  }
  let crc = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ bytes[index]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function laceSizes(packet: Uint8Array): number[] {
  const sizes: number[] = [];
  let remaining = packet.byteLength;
  while (remaining >= MAX_SEGMENT_BYTES) {
    sizes.push(MAX_SEGMENT_BYTES);
    remaining -= MAX_SEGMENT_BYTES;
  }
  sizes.push(remaining);
  return sizes;
}

function buildPage(input: {
  flags: number;
  granule: number;
  serial: number;
  sequence: number;
  packets: Uint8Array[];
}): Uint8Array<ArrayBuffer> {
  const segments: number[] = [];
  for (const packet of input.packets) segments.push(...laceSizes(packet));
  const headerBytes = HEADER_BYTES + segments.length;
  const bodyBytes = input.packets.reduce(
    (total, packet) => total + packet.byteLength,
    0,
  );
  const page = new Uint8Array(headerBytes + bodyBytes);
  const view = new DataView(page.buffer);
  page[0] = 0x4f;
  page[1] = 0x67;
  page[2] = 0x67;
  page[3] = 0x53;
  page[4] = 0;
  page[5] = input.flags;
  view.setUint32(6, input.granule >>> 0, true);
  view.setUint32(10, Math.floor(input.granule / 0x100000000) >>> 0, true);
  view.setUint32(14, input.serial, true);
  view.setUint32(18, input.sequence, true);
  // CRC placeholder: zeroed, then filled after the rest of the page exists.
  view.setUint32(22, 0, true);
  page[26] = segments.length;
  for (let index = 0; index < segments.length; index += 1) {
    page[HEADER_BYTES + index] = segments[index];
  }
  let cursor = headerBytes;
  for (const packet of input.packets) {
    page.set(packet, cursor);
    cursor += packet.byteLength;
  }
  view.setUint32(22, crc32(page), true);
  return page;
}

/**
 * Merges the encoder's one-page-per-packet output into ~1 s pages. Returns
 * null whenever the input is not a clean two-header-page Opus stream, when a
 * packet spans pages, or when merging would not shrink the file — callers
 * then keep the bytes they already have.
 */
export function repageOggOpus(
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  const pages = parsePages(bytes);
  if (!pages || pages.length < 3) return null;
  const serial = pages[0].serial;
  if (pages.some((page) => page.serial !== serial)) return null;
  // Page 0 must be the OpusHead BOS page and page 1 the OpusTags page; both are
  // copied verbatim so the codec headers stay byte-identical.
  const head = pages[0];
  const tags = pages[1];
  if (
    head.packets.length !== 1 ||
    tags.packets.length !== 1 ||
    ascii(head.packets[0], 0, 8) !== "OpusHead" ||
    ascii(tags.packets[0], 0, 8) !== "OpusTags"
  ) {
    return null;
  }

  const audio = pages.slice(2);
  const lastGranule = audio[audio.length - 1].granule;
  const output: Uint8Array<ArrayBuffer>[] = [
    buildPage({
      flags: head.flags,
      granule: head.granule,
      serial,
      sequence: 0,
      packets: head.packets,
    }),
    buildPage({
      flags: tags.flags,
      granule: tags.granule,
      serial,
      sequence: 1,
      packets: tags.packets,
    }),
  ];

  let sequence = 2;
  let packets: Uint8Array[] = [];
  let segments = 0;
  let spanStart = 0;
  let granule = 0;

  const flush = (isLast: boolean) => {
    output.push(
      buildPage({
        flags: isLast ? 0x04 : 0,
        granule: isLast ? lastGranule : granule,
        serial,
        sequence: sequence++,
        packets,
      }),
    );
    packets = [];
    segments = 0;
  };

  for (const page of audio) {
    for (const packet of page.packets) {
      const added = laceSizes(packet).length;
      if (
        packets.length > 0 &&
        (granule - spanStart >= TARGET_PAGE_GRANULE ||
          segments + added > MAX_SEGMENTS)
      ) {
        flush(false);
        spanStart = granule;
      }
      packets.push(packet);
      segments += added;
    }
    granule = page.granule;
  }
  flush(true);

  const total = output.reduce((sum, page) => sum + page.byteLength, 0);
  if (total >= bytes.byteLength) return null;
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const page of output) {
    merged.set(page, cursor);
    cursor += page.byteLength;
  }
  return merged;
}
