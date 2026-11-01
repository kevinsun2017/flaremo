/**
 * Audio half of the best-effort client-side transcode before upload
 * (docs/audio-compression-research.md): lossless sources are decoded and
 * re-encoded as Ogg Opus, one second of source audio per encode call, then
 * repaged. Compression is decoration, never a contract: every failure path
 * returns null and the caller uploads the original file, and a transcode that
 * does not actually shrink the payload is discarded. The pipeline also refuses
 * to transcode when the browser cannot play Ogg Opus back, or when the decoded
 * PCM would exceed the memory budget — an unplayable or tab-killing attachment
 * is worse than a large one.
 */
import { repageOggOpus } from "../ogg-repage";
import type { AudioFormat } from "./audio-format";
import { readAudioFormat } from "./audio-format";
import {
  MAX_COMPRESSION_INPUT_BYTES,
  withExtension,
} from "./image-compression";

/** Uncompressed/lossless audio is worth transcoding; lossy sources are not. */
const LOSSLESS_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
]);

const LOSSLESS_AUDIO_EXTENSIONS = /\.(wav|wave|aif|aiff|aifc|flac)$/;

// decodeAudioData resamples to the context rate, so a low-rate source can be
// decoded at its own rate: a 16 kHz mono recording then costs a third of what
// a 48 kHz decode would, and the encoder upsamples to 48 kHz internally.
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_RATE_MIN = 8_000;
const AUDIO_RATE_MAX = 48_000;
// One second of source audio per encode call. The package buffers partial Opus
// frames internally, so this costs nothing in output size (measured identical),
// and it keeps the resampler exact: one second of any rate maps to 48000
// samples, where 20 ms chunks let the per-call rounding accumulate (measured
// 0.018% short over 10 s at 11025 Hz). It also cuts the resampler's
// chunk-edge discontinuities from 50/s to 1/s.
const AUDIO_CHUNK_SECONDS = 1;
const AUDIO_BITRATE_STEREO_KBPS = 96;
const AUDIO_BITRATE_MONO_KBPS = 32;
// Decoded PCM is Float32 — 4 bytes per sample per channel. A 25 MiB 8 kHz mono
// WAV (54 minutes) would decode to ~105 MB and take a mobile tab down, so past
// this budget the transcode is skipped and the original file is uploaded.
const MAX_DECODED_AUDIO_BYTES = 96 * 1024 * 1024;
// Unparseable header: assume the least efficient container worth compressing
// (8 kHz mono, 1 byte per sample) rather than trusting the file size.
const UNKNOWN_AUDIO_BYTES_FACTOR = 6;
// One Opus frame (20 ms at 48 kHz) — the unit the encoder requires per call.
const AUDIO_OPUS_FRAME_SAMPLES = 960;

function concatChunks(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  // Allocated here, so the result is always backed by a plain ArrayBuffer:
  // BlobPart rejects the ArrayBufferLike default.
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export function shouldCompressAudio(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "") {
    // Some pickers hand over extension-only files.
    return LOSSLESS_AUDIO_EXTENSIONS.test(file.name.toLowerCase());
  }
  return LOSSLESS_AUDIO_TYPES.has(type);
}

function audioContextRate(sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return AUDIO_SAMPLE_RATE;
  return Math.min(
    Math.max(Math.round(sampleRate), AUDIO_RATE_MIN),
    AUDIO_RATE_MAX,
  );
}

function estimateDecodedBytes(
  fileBytes: number,
  format: AudioFormat | undefined,
  contextRate: number,
): number {
  if (!format || format.totalSamples <= 0) {
    return fileBytes * UNKNOWN_AUDIO_BYTES_FACTOR;
  }
  const rateScale = Math.max(1, contextRate / format.sampleRate);
  return format.totalSamples * rateScale * format.channels * 4;
}

/**
 * Proves this browser can actually decode Ogg Opus before any attachment is
 * transcoded into it. Ogg Opus playback only reached Safari 18.4 / iOS 18.4
 * (macOS 15.4), and a transcode the uploading device cannot play back is worse
 * than a large file.
 *
 * The proof decodes a real stream from this very encoder rather than a
 * capability string: canPlayType has a documented history of answering
 * optimistically for Ogg (WebKit returned "probably" for a container it could
 * not demux), and it also has false negatives on Safari. A prefix of some
 * larger payload is no good either — browsers disagree about truncated Ogg, so
 * that would prove nothing. One 20 ms silence frame plus the flush is a
 * complete ~225-byte file; the frame is what makes it decodable, since a
 * headers-and-EOS-only stream is rejected by real decoders (both verified
 * against Chromium while implementing this).
 */
async function canDecodeOggOpus(): Promise<boolean> {
  try {
    const { default: createOpus } = await import("@audio/encode-opus");
    const encoder = await createOpus({
      sampleRate: AUDIO_SAMPLE_RATE,
      channels: 1,
      bitrate: AUDIO_BITRATE_MONO_KBPS,
      application: "voip",
    });
    let stream: Uint8Array<ArrayBuffer> | null = null;
    try {
      const frame = encoder.encode([
        new Float32Array(AUDIO_OPUS_FRAME_SAMPLES),
      ]);
      const tail = encoder.flush();
      const joined = new Uint8Array(frame.byteLength + tail.byteLength);
      joined.set(frame);
      joined.set(tail, frame.byteLength);
      stream = joined;
    } finally {
      encoder.free();
    }
    if (!stream) return false;
    await new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE).decodeAudioData(
      stream.buffer,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns an Ogg Opus File, or null when the input should be uploaded as-is
 * (lossy sources, decode/encode failure, or no size win).
 */
export async function compressAudio(file: File): Promise<File | null> {
  if (!shouldCompressAudio(file)) return null;
  if (file.size > MAX_COMPRESSION_INPUT_BYTES) return null;
  // Cheapest gate first: no point decoding a large file into a format this
  // browser cannot play back.
  if (!(await canDecodeOggOpus())) return null;
  try {
    const data = await file.arrayBuffer();
    const format = readAudioFormat(new Uint8Array(data));
    const contextRate = format
      ? audioContextRate(format.sampleRate)
      : AUDIO_SAMPLE_RATE;
    if (
      estimateDecodedBytes(file.size, format, contextRate) >
      MAX_DECODED_AUDIO_BYTES
    ) {
      return null;
    }

    const buffer = await new OfflineAudioContext(
      1,
      1,
      contextRate,
    ).decodeAudioData(data);
    // Nothing decoded: the encoder would emit headers and an EOS page with no
    // audio frame, which real decoders reject (see canDecodeOggOpus). Upload
    // the original instead of a file no browser can play.
    if (!buffer.length) return null;
    const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
    const channelData: Float32Array[] = [];
    for (let index = 0; index < channels; index += 1) {
      channelData.push(buffer.getChannelData(index));
    }

    const { default: createOpus } = await import("@audio/encode-opus");
    const encoder = await createOpus({
      sampleRate: contextRate,
      channels,
      bitrate:
        channels === 2 ? AUDIO_BITRATE_STEREO_KBPS : AUDIO_BITRATE_MONO_KBPS,
      application: channels === 2 ? "audio" : "voip",
    });
    const chunkSamples = Math.max(
      1,
      Math.round(contextRate * AUDIO_CHUNK_SECONDS),
    );
    const chunks: Uint8Array[] = [];
    try {
      for (let offset = 0; offset < buffer.length; offset += chunkSamples) {
        const end = Math.min(offset + chunkSamples, buffer.length);
        chunks.push(
          encoder.encode(channelData.map((data) => data.subarray(offset, end))),
        );
      }
      chunks.push(encoder.flush());
    } finally {
      encoder.free();
    }

    // The muxer writes one page per 20 ms packet; merging them into ~1 s pages
    // drops a quarter to a third of the payload and keeps WebKit from
    // over-reporting the duration (see ogg-repage.ts). concatChunks also owns
    // the copy out of the encoder's heap, so the chunks above stay untouched.
    const encoded = concatChunks(chunks);
    const repaged = repageOggOpus(encoded);
    const blob = new Blob([repaged ?? encoded], { type: "audio/ogg" });
    if (blob.size >= file.size) return null;
    return new File([blob], withExtension(file.name, "ogg"), {
      type: "audio/ogg",
    });
  } catch {
    return null;
  }
}
