import { isUnsafeCSS, SHARE_CARD_SVG_TAGS } from "../../document";
import { isPlainObject } from "../../validate";
import type { Checker } from "../checker";
import {
  COLOR_KEYWORDS,
  MAX_NODE_DEPTH,
  SVG_FILTER_REF_PATTERN,
} from "../constants";
import { checkColorValue } from "./color";
export function checkSvgNode(
  checker: Checker,
  node: unknown,
  where: string,
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
    checker.error("svg/invalid", `${where}: SVG node must be an object`);
    return;
  }
  const tag = node.tag;
  if (typeof tag !== "string" || !SHARE_CARD_SVG_TAGS.has(tag)) {
    checker.error(
      "svg/unknown-tag",
      `${where}.tag: "${String(tag)}" is not an allowed SVG element (allowed: ${[...SHARE_CARD_SVG_TAGS].join(", ")})`,
    );
  }
  if (node.attrs !== undefined) {
    if (!isPlainObject(node.attrs)) {
      checker.error("svg/invalid", `${where}.attrs: must be an object`);
    } else {
      for (const [name, value] of Object.entries(node.attrs)) {
        const lower = name.toLowerCase();
        if (lower.startsWith("on")) {
          checker.error(
            "svg/event-handler",
            `${where}.attrs.${name}: event handlers are not allowed`,
          );
          continue;
        }
        if (lower === "style") {
          checker.error(
            "svg/style-attr",
            `${where}.attrs.style: use per-attribute styling instead`,
          );
          continue;
        }
        if (lower === "href" || lower === "xlink:href") {
          const ok =
            typeof value === "string" &&
            (value.startsWith("#") || value.startsWith("data:image/"));
          if (!ok) {
            checker.error(
              "svg/href",
              `${where}.attrs.${name}: only "#id" references and data: images are allowed`,
            );
          }
          continue;
        }
        if (lower === "filter") {
          if (
            typeof value !== "string" ||
            !SVG_FILTER_REF_PATTERN.test(value.trim())
          ) {
            checker.error(
              "svg/filter",
              `${where}.attrs.${name}: must be "url(#filterId)"`,
            );
          }
          continue;
        }
        if (lower === "fill" || lower === "stroke" || lower === "color") {
          if (
            typeof value === "string" &&
            SVG_FILTER_REF_PATTERN.test(value.trim())
          ) {
            continue; // gradient/filter paint references
          }
          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            checkColorValue(checker, value, `${where}.attrs.${name}`);
            continue;
          }
          checkColorValue(checker, value, `${where}.attrs.${name}`, {
            keywords: COLOR_KEYWORDS,
          });
          continue;
        }
        if (typeof value === "string" && isUnsafeCSS(value)) {
          checker.error(
            "svg/unsafe-value",
            `${where}.attrs.${name}: url()/expression()/javascript: are not allowed`,
          );
        }
      }
    }
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      checker.error("svg/invalid", `${where}.children: must be an array`);
      return;
    }
    for (const [index, child] of node.children.entries()) {
      checkSvgNode(checker, child, `${where}.children[${index}]`, depth + 1);
    }
  }
}
