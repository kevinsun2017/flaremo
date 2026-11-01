/**
 * Engine capability probe behind the transcode decisions. It answers "can this
 * engine actually encode what the image pipeline would produce", never a
 * capability string: claiming compressibility on a browser that cannot encode
 * WebP (Safari, verified against real WebKit, which falls back to PNG from
 * toDataURL and toBlob alike) would send the user through a long upload the
 * server then refuses.
 *
 * The audio side of this question is proven by an encoder round-trip against
 * the audio pipeline's own parameters, so it lives with that pipeline
 * (audio-compression.ts, canDecodeOggOpus) rather than importing its way back
 * here.
 */
export function supportsWebpEncode(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}
