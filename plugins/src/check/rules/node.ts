import type { SvgNode } from "../../document";
import { isPlainObject } from "../../validate";
import type { Checker } from "../checker";
import { MAX_NODE_DEPTH, NODE_TYPES } from "../constants";
import { checkBindings, checkLocalizedText } from "./bindings";
import { checkStyle } from "./style";
import { checkSvgNode } from "./svg";
/** Bindings whose resolved text is Han for zh/ja/ko users: the note body is
 *  prose in the user's language, and `{date}` formats as "9月19日 11:25". The
 *  rest (day.padded, stats, marks) are digits or images. */
export const HAN_CAPABLE_BINDINGS = new Set(["body", "date", "brand.product"]);

/** True when the node renders text that is Han for some locale — a localized
 *  string, or a `{binding}` placeholder for one of the Han-capable bindings.
 *  Used to warn when card tracking will be ignored at render time. */
export function nodeTextIsTranslatable(node: Record<string, unknown>): boolean {
  const text = node.text;
  if (isPlainObject(text)) return Object.keys(text).length > 0;
  if (typeof text !== "string") return false;
  // A bare placeholder ("{date}") resolves through the binding table.
  const placeholder = /^\{([\w.]+)\}$/.exec(text.trim());
  if (placeholder?.[1]) return HAN_CAPABLE_BINDINGS.has(placeholder[1]);
  // Otherwise it is a literal, which is authored per locale.
  return text.trim().length > 0;
}

export function checkNode(
  checker: Checker,
  node: unknown,
  where: string,
  optionKeys: Set<string>,
  depth: number,
): void {
  if (depth > MAX_NODE_DEPTH) {
    checker.error(
      "document/too-deep",
      `${where}: nesting exceeds ${MAX_NODE_DEPTH} levels`,
    );
    return;
  }
  if (!isPlainObject(node)) {
    checker.error("document/invalid", `${where}: node must be an object`);
    return;
  }
  const type = node.type;
  if (typeof type !== "string" || !NODE_TYPES.has(type)) {
    checker.error(
      "card/unknown-node",
      `${where}.type: unknown node type "${String(type)}" (expected: ${[...NODE_TYPES].join(", ")})`,
    );
    return;
  }
  // A node whose text is resolved per locale (a literal, or a `{body}` /
  // `{date}` binding) renders Han for zh/ja/ko users, where card tracking is
  // ignored at render time.
  checkStyle(
    checker,
    node.style,
    `${where}.style`,
    nodeTextIsTranslatable(node),
  );

  switch (type) {
    case "row":
    case "column": {
      if (node.children !== undefined && !Array.isArray(node.children)) {
        checker.error(
          "document/invalid",
          `${where}.children: must be an array`,
        );
        break;
      }
      for (const [index, child] of (
        node.children as unknown[] | undefined
      )?.entries() ?? []) {
        checkNode(
          checker,
          child,
          `${where}.children[${index}]`,
          optionKeys,
          depth + 1,
        );
      }
      break;
    }
    case "text": {
      if (node.text === undefined) {
        checker.error("document/invalid", `${where}.text: is required`);
        break;
      }
      checkLocalizedText(checker, node.text, `${where}.text`, optionKeys);
      break;
    }
    case "image": {
      const src = node.src;
      if (typeof src !== "string" || src.trim().length === 0) {
        checker.error("document/invalid", `${where}.src: is required`);
        break;
      }
      checkBindings(checker, src, `${where}.src`, optionKeys);
      const resolved = src.replace(/\{[a-zA-Z0-9_.]+\}/g, "");
      if (/^https?:|^\/\//i.test(src.trim())) {
        checker.error(
          "image/external",
          `${where}.src: external images are not allowed — inline the image as a data: URI`,
        );
      } else if (
        resolved.trim().length > 0 &&
        !src.startsWith("data:image/") &&
        !src.startsWith("blob:")
      ) {
        checker.warn(
          "image/relative",
          `${where}.src: relative file paths are not resolved for document cards yet — inline the image as a data: URI`,
        );
      }
      break;
    }
    case "svg": {
      if (typeof node.viewBox !== "string" || !/\d/.test(node.viewBox)) {
        checker.error(
          "document/invalid",
          `${where}.viewBox: is required (e.g. "0 0 340 210")`,
        );
      }
      for (const [index, child] of (
        node.children as SvgNode[] | undefined
      )?.entries() ?? []) {
        checkSvgNode(checker, child, `${where}.children[${index}]`, depth + 1);
      }
      break;
    }
    default:
      break;
  }
}
