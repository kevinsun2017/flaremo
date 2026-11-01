import { PLUGIN_PACKAGE_LIMITS } from "../../spec";
import type { Checker } from "../checker";
export function checkPreview(
  checker: Checker,
  bytes: Uint8Array,
  where: string,
): void {
  if (bytes.byteLength > PLUGIN_PACKAGE_LIMITS.maxPreviewBytes) {
    checker.error(
      "preview/too-large",
      `${where}: preview is ${Math.round(bytes.byteLength / 1024)}KB (limit ${PLUGIN_PACKAGE_LIMITS.maxPreviewBytes / 1024}KB)`,
    );
  }
  const isPng =
    bytes.byteLength > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (!isPng) {
    checker.error("preview/not-png", `${where}: preview must be a PNG file`);
    return;
  }
  // PNG stores dimensions big-endian at a fixed offset (IHDR width/height).
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 200 || height < 200) {
    checker.warn(
      "preview/small",
      `${where}: preview is ${width}×${height}px — at least 200px per side reads better in the store`,
    );
  }
}
