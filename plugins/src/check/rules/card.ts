import { SHARE_CARD_SPEC_VERSION } from "../../document";
import type { ShareCardContribution } from "../../spec";
import { isPlainObject } from "../../validate";
import type { Checker } from "../checker";
import { decoder, KNOWN_CARD_KEYS, KNOWN_OPTION_KEYS } from "../constants";
import { checkNode } from "./node";
import { checkPreview } from "./preview";
import { checkSandbox } from "./sandbox";
export function checkCard(
  checker: Checker,
  card: ShareCardContribution,
  rawCard: unknown,
  files: Record<string, Uint8Array>,
): void {
  const where = `card "${card.id}"`;
  if (isPlainObject(rawCard)) {
    for (const key of Object.keys(rawCard)) {
      if (!KNOWN_CARD_KEYS.has(key)) {
        checker.warn(
          "manifest/unknown-field",
          `${where}: field "${key}" is not part of the spec and is ignored`,
        );
      }
    }
    if (card.kind === "document" && rawCard.entry !== undefined) {
      checker.warn(
        "manifest/extra-field",
        `${where}: "entry" is only used by sandbox cards`,
      );
    }
    if (card.kind === "sandbox" && rawCard.document !== undefined) {
      checker.warn(
        "manifest/extra-field",
        `${where}: "document" is only used by document cards`,
      );
    }
    if (Array.isArray(rawCard.options)) {
      for (const option of rawCard.options) {
        if (!isPlainObject(option)) continue;
        for (const key of Object.keys(option)) {
          if (!KNOWN_OPTION_KEYS.has(key)) {
            checker.warn(
              "manifest/unknown-field",
              `${where}: option "${String(option.key)}" has unknown field "${key}" (ignored)`,
            );
          }
        }
      }
    }
  }

  const optionKeys = new Set((card.options ?? []).map((option) => option.key));

  if (card.preview) {
    const previewBytes = files[card.preview];
    if (!previewBytes) {
      checker.error(
        "card/missing-file",
        `${where}: references a missing file (preview): ${card.preview}`,
      );
    } else {
      checkPreview(checker, previewBytes, `${card.preview}`);
    }
  }

  if (card.kind === "document") {
    const documentPath = card.document ?? "";
    const bytes = files[documentPath];
    if (!bytes) {
      checker.error(
        "card/missing-file",
        `${where}: references a missing file: ${documentPath}`,
      );
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(bytes));
    } catch {
      checker.error("card/invalid-json", `${documentPath}: is not valid JSON`);
      return;
    }
    if (!isPlainObject(parsed)) {
      checker.error(
        "card/invalid",
        `${documentPath}: document must be an object`,
      );
      return;
    }
    if (parsed.specVersion !== SHARE_CARD_SPEC_VERSION) {
      checker.error(
        "card/spec-version",
        `${documentPath}: specVersion must be ${SHARE_CARD_SPEC_VERSION}`,
      );
    }
    if (parsed.root === undefined) {
      checker.error("card/invalid", `${documentPath}: "root" is required`);
      return;
    }
    checkNode(checker, parsed.root, `${documentPath} · root`, optionKeys, 0);
    return;
  }

  const entryPath = card.entry ?? "";
  const bytes = files[entryPath];
  if (!bytes) {
    checker.error(
      "card/missing-file",
      `${where}: references a missing file: ${entryPath}`,
    );
    return;
  }
  checkSandbox(checker, decoder.decode(bytes), entryPath, files);
}
