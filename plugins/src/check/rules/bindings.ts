import { isPlainObject } from "../../validate";
import type { Checker } from "../checker";
import { KNOWN_BINDINGS } from "../constants";
export function checkBindings(
  checker: Checker,
  text: string,
  where: string,
  optionKeys: Set<string>,
): void {
  for (const match of text.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)) {
    const token = match[1] ?? "";
    if (KNOWN_BINDINGS.has(token)) continue;
    if (token.startsWith("options.")) {
      const key = token.slice("options.".length);
      if (!optionKeys.has(key)) {
        checker.error(
          "binding/unknown-option",
          `${where}: "{${token}}" refers to an option that is not declared in this card's "options"`,
        );
      }
      continue;
    }
    checker.warn(
      "binding/unknown",
      `${where}: "{${token}}" is not a known binding and will render literally`,
    );
  }
}

export function checkLocalizedText(
  checker: Checker,
  value: unknown,
  where: string,
  optionKeys: Set<string>,
): void {
  if (typeof value === "string") {
    checkBindings(checker, value, where, optionKeys);
    return;
  }
  if (isPlainObject(value)) {
    for (const [locale, text] of Object.entries(value)) {
      if (typeof text !== "string") {
        checker.error(
          "text/invalid",
          `${where}.${locale}: text values must be strings`,
        );
        continue;
      }
      checkBindings(checker, text, `${where}.${locale}`, optionKeys);
    }
    return;
  }
  checker.error(
    "text/invalid",
    `${where}: text must be a string or a locale table`,
  );
}
