/**
 * Container parsing for the lossless audio sources the transcode path may
 * meet (WAV/RIFF, AIFF/AIFC, FLAC). Only the sample rate, channel count and
 * total sample count are read; an unparseable or lying header returns
 * undefined so the caller falls back to its own conservative estimate.
 */

export type AudioFormat = {
  sampleRate: number;
  channels: number;
  totalSamples: number;
};

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  const end = Math.min(offset + length, bytes.byteLength);
  for (let index = Math.max(0, offset); index < end; index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}

/**
 * Walks RIFF/AIFF chunks (4-byte id, 4-byte size, even-padded payload). A
 * chunk claiming more bytes than the file holds ends the walk, so a truncated
 * or lying header cannot spin here.
 */
function* readChunks(bytes: Uint8Array, start: number, littleEndian: boolean) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, littleEndian);
    const body = offset + 8;
    yield { id: readAscii(bytes, offset, 4), body, size };
    if (size > bytes.byteLength) return;
    offset = body + size + (size % 2);
  }
}

function parseWav(bytes: Uint8Array): AudioFormat | undefined {
  if (readAscii(bytes, 8, 4) !== "WAVE") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 0;
  let channels = 0;
  let blockAlign = 0;
  let dataBytes = 0;
  for (const chunk of readChunks(bytes, 12, true)) {
    if (
      chunk.id === "fmt " &&
      chunk.size >= 16 &&
      chunk.body + 16 <= bytes.byteLength
    ) {
      channels = view.getUint16(chunk.body + 2, true);
      sampleRate = view.getUint32(chunk.body + 4, true);
      blockAlign = view.getUint16(chunk.body + 12, true);
    } else if (chunk.id === "data") {
      // Streaming writers leave the size at 0 or 0xffffffff; fall back to the
      // bytes actually present.
      dataBytes =
        chunk.size > 0 &&
        chunk.size !== 0xffffffff &&
        chunk.body + chunk.size <= bytes.byteLength
          ? chunk.size
          : bytes.byteLength - chunk.body;
    }
  }
  const frameBytes = blockAlign > 0 ? blockAlign : channels * 2;
  if (!sampleRate || !channels || !dataBytes) return undefined;
  return {
    sampleRate,
    channels,
    totalSamples: Math.floor(dataBytes / frameBytes),
  };
}

/** 80-bit IEEE 754 extended float — the AIFF sample rate encoding. */
function readExtended80(bytes: Uint8Array, offset: number): number {
  if (offset + 10 > bytes.byteLength) return 0;
  const exponent = ((bytes[offset] & 0x7f) << 8) | bytes[offset + 1];
  let mantissa = 0;
  for (let index = 2; index < 10; index += 1) {
    mantissa = mantissa * 256 + bytes[offset + index];
  }
  if (!exponent || !mantissa) return 0;
  return mantissa * 2 ** (exponent - 16383 - 63);
}

function parseAiff(bytes: Uint8Array): AudioFormat | undefined {
  const form = readAscii(bytes, 8, 4);
  if (form !== "AIFF" && form !== "AIFC") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const chunk of readChunks(bytes, 12, false)) {
    if (
      chunk.id !== "COMM" ||
      chunk.size < 18 ||
      chunk.body + 18 > bytes.byteLength
    ) {
      continue;
    }
    const channels = view.getUint16(chunk.body, false);
    const totalSamples = view.getUint32(chunk.body + 2, false);
    const sampleRate = readExtended80(bytes, chunk.body + 8);
    if (!channels || !totalSamples || !sampleRate) return undefined;
    return { sampleRate, channels, totalSamples };
  }
  return undefined;
}

function parseFlac(bytes: Uint8Array): AudioFormat | undefined {
  // STREAMINFO is mandatory and always the first metadata block (34 bytes).
  if (bytes.byteLength < 8 + 34 || (bytes[4] & 0x7f) !== 0) return undefined;
  const byte = (index: number) => bytes[8 + index];
  const sampleRate = (byte(10) << 12) | (byte(11) << 4) | (byte(12) >> 4);
  const channels = ((byte(12) >> 1) & 0x07) + 1;
  const totalSamples =
    (byte(13) & 0x0f) * 2 ** 32 +
    ((byte(14) << 24) | (byte(15) << 16) | (byte(16) << 8) | byte(17));
  if (!sampleRate || !channels) return undefined;
  return { sampleRate, channels, totalSamples };
}

export function readAudioFormat(bytes: Uint8Array): AudioFormat | undefined {
  switch (readAscii(bytes, 0, 4)) {
    case "RIFF":
    case "RF64":
      return parseWav(bytes);
    case "FORM":
      return parseAiff(bytes);
    case "fLaC":
      return parseFlac(bytes);
    default:
      return undefined;
  }
}
