import type { Checker } from "../checker";

/** Dangerous attribute names whose values must stay inside the package. */
const RESOURCE_ATTR_PATTERN =
  /\b(src|href|srcset|poster|data|action|formaction|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const TAG_PATTERN =
  /<(script|link|iframe|object|embed|img|source|video|audio)\b[^>]*>/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

export function checkSandbox(
  checker: Checker,
  html: string,
  entryPath: string,
  files: Record<string, Uint8Array>,
): void {
  const pushReference = (raw: string, where: string): void => {
    const value = raw.trim();
    if (!value) return;
    if (
      value.startsWith("data:") ||
      value.startsWith("blob:") ||
      value.startsWith("#")
    ) {
      return;
    }
    if (/^https?:|^\/\//i.test(value)) {
      checker.error(
        "sandbox/external-url",
        `${where}: "${value}" loads from the network — the sandbox blocks it, so inline the resource (data: URI)`,
      );
      return;
    }
    if (value.startsWith("/")) {
      checker.error(
        "sandbox/absolute-path",
        `${where}: "${value}" is an absolute path and cannot resolve inside the sandbox — inline the resource or use a path relative to this file`,
      );
      return;
    }
    const resolved = checker.resolveFrom(entryPath, value);
    if (!resolved) {
      checker.error(
        "sandbox/escapes-package",
        `${where}: "${value}" points outside the plugin folder`,
      );
      return;
    }
    if (!files[resolved]) {
      checker.error(
        "sandbox/missing-asset",
        `${where}: "${value}" does not exist in the package (expected ${resolved})`,
      );
    }
  };

  if (/<base\b/i.test(html)) {
    checker.error(
      "sandbox/base-tag",
      `${entryPath}: <base> is not allowed inside plugin entries`,
    );
  }

  for (const tagMatch of html.matchAll(TAG_PATTERN)) {
    const tagText = tagMatch[0];
    const tagName = (tagMatch[1] ?? "").toLowerCase();
    if (tagName === "script" && /\bsrc\s*=/i.test(tagText)) {
      checker.error(
        "sandbox/external-script",
        `${entryPath}: <script src=…> cannot load in the sandbox — use an inline <script>`,
      );
      continue;
    }
    if (tagName === "link" && /\brel\s*=\s*["']?stylesheet/i.test(tagText)) {
      checker.error(
        "sandbox/external-style",
        `${entryPath}: external stylesheets cannot load in the sandbox — use an inline <style>`,
      );
      continue;
    }
    if (tagName === "iframe" || tagName === "object" || tagName === "embed") {
      checker.error(
        "sandbox/nested-frame",
        `${entryPath}: <${tagName}> is not allowed inside plugin entries`,
      );
      continue;
    }
    for (const attrMatch of tagText.matchAll(RESOURCE_ATTR_PATTERN)) {
      const attrName = (attrMatch[1] ?? "").toLowerCase();
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? "";
      if (attrName === "srcset") {
        for (const candidate of value.split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          if (url) pushReference(url, `${entryPath}: srcset`);
        }
        continue;
      }
      pushReference(value, `${entryPath}: ${attrName}`);
    }
  }

  if (/@import\s/i.test(html)) {
    checker.error(
      "sandbox/css-import",
      `${entryPath}: @import is not allowed — use an inline <style>`,
    );
  }
  for (const urlMatch of html.matchAll(CSS_URL_PATTERN)) {
    const value = (urlMatch[2] ?? "").trim();
    if (value.startsWith("#")) continue; // SVG paint references
    pushReference(value, `${entryPath}: css url()`);
  }
}
