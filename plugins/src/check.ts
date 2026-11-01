import { Checker, type CheckIssue } from "./check/checker";
import {
  BUILT_IN_FONT_FAMILIES,
  decoder,
  KNOWN_MANIFEST_KEYS,
} from "./check/constants";
import { checkCard } from "./check/rules/card";
import { checkPreview } from "./check/rules/preview";
import type { PluginManifest } from "./spec";
import { isPlainObject, validatePluginManifest } from "./validate";

/**
 * Deep validation of a plugin package — the author-facing "GScan": structure,
 * manifest, card documents (nodes/styles/colors/bindings/SVG whitelist),
 * sandbox self-containment, previews and assets. Pure (no I/O), so the same
 * code runs in the CLI (`pnpm plugin:check`), in the repo build
 * (`pnpm plugins:build`), and on the instance at upload/install time
 * (`readPluginPackage`), keeping author tooling and instance enforcement
 * identical.
 *
 * Severities: `error` blocks install/build; `warning` is advisory (forward
 * compatible or cosmetic). Unknown node types are errors here even though the
 * runtime skips them — that skip exists for *newer* specs read by older apps,
 * while a v1 document with an unknown node is an author typo.
 *
 * The rules live under `./check/`: `Checker` (issue sink + path resolution),
 * the shared `constants`, and one module per domain under `./check/rules/`.
 * This file is the entry point and the external surface — consumers keep
 * importing `./check` exactly as before.
 */

export type { CheckIssue, CheckSeverity } from "./check/checker";

export type PluginCheckResult = {
  pluginId: string | null;
  version: string | null;
  manifest: PluginManifest | null;
  issues: CheckIssue[];
  /** True when no issue of severity `error` was found. */
  ok: boolean;
};

export type PluginCheckInput = {
  /** Package-relative paths (the `<id>/` prefix already stripped). */
  files: Record<string, Uint8Array>;
  /** Zip root folder / repo folder name the package must be rooted at. */
  rootFolder?: string;
  /** Repo tier, when known: enables the community governance checks. */
  tier?: "official" | "community";
};

/** Validate a full package (manifest + cards + assets). Pure; never throws. */
export function checkPluginFiles(input: PluginCheckInput): PluginCheckResult {
  const checker = new Checker();
  const { files } = input;

  const manifestBytes = files["plugin.json"];
  if (!manifestBytes) {
    checker.error(
      "manifest/missing",
      "plugin.json is missing at the package root",
    );
    return {
      pluginId: null,
      version: null,
      manifest: null,
      issues: checker.issues,
      ok: false,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    checker.error("manifest/invalid-json", "plugin.json is not valid JSON");
    return {
      pluginId: null,
      version: null,
      manifest: null,
      issues: checker.issues,
      ok: false,
    };
  }
  if (isPlainObject(raw)) {
    for (const key of Object.keys(raw)) {
      if (!KNOWN_MANIFEST_KEYS.has(key)) {
        checker.warn(
          "manifest/unknown-field",
          `plugin.json: field "${key}" is not part of the spec and is ignored`,
        );
      }
    }
    if (isPlainObject(raw.contributes)) {
      for (const key of Object.keys(raw.contributes)) {
        if (key !== "shareCardTemplates") {
          checker.warn(
            "manifest/unknown-field",
            `plugin.json: contributes."${key}" is not a known slot and is ignored`,
          );
        }
      }
    }
  }

  const { manifest, problems } = validatePluginManifest(raw);
  for (const problem of problems) {
    checker.error("manifest/invalid", `plugin.json: ${problem}`);
  }
  if (!manifest) {
    return {
      pluginId: null,
      version: null,
      manifest: null,
      issues: checker.issues,
      ok: false,
    };
  }

  if (input.rootFolder && input.rootFolder !== manifest.id) {
    checker.error(
      "manifest/id-mismatch",
      `plugin.json: id "${manifest.id}" must match the package folder "${input.rootFolder}"`,
    );
  }
  if (input.tier === "community") {
    if (!manifest.author?.name) {
      checker.error(
        "manifest/missing-author",
        "plugin.json: community plugins must declare an author",
      );
    }
    if (!manifest.license) {
      checker.warn(
        "manifest/missing-license",
        "plugin.json: no license declared — it is treated as AGPL-3.0-only",
      );
    }
  }

  const rawCards =
    isPlainObject(raw) &&
    isPlainObject(raw.contributes) &&
    Array.isArray(raw.contributes.shareCardTemplates)
      ? (raw.contributes.shareCardTemplates as unknown[])
      : [];
  (manifest.contributes.shareCardTemplates ?? []).forEach((card, index) => {
    checkCard(checker, card, rawCards[index], files);
  });

  if (files["preview.png"]) {
    checkPreview(checker, files["preview.png"], "preview.png");
  }

  // Font binaries are rejected outright rather than size-limited. No runtime
  // path can consume one: a document card can only name the four built-in
  // families (ShareCardContribution has no fonts field, and the renderer maps
  // family → an app CSS variable), while a sandbox card runs under a
  // `font-src data:` CSP that blocks every packaged file. So shipping one would
  // only add weight — and risk: the free-for-commercial Han faces this project
  // may reference by name (MiSans, HarmonyOS Sans) forbid redistribution as
  // standalone files, which is exactly what a package asset is.
  for (const name of Object.keys(files)) {
    if (!/\.(woff2?|ttf|otf|eot)$/i.test(name)) continue;
    checker.error(
      "asset/font-not-supported",
      `${name}: card packages cannot ship font files. Document cards choose one of the built-in families (${[...BUILT_IN_FONT_FAMILIES].join("/")}), and sandbox cards may only use system fonts (their CSP blocks packaged webfonts). Referencing a font by name in a CSS stack is fine; bundling the file is not.`,
    );
  }

  return {
    pluginId: manifest.id,
    version: manifest.version,
    manifest,
    issues: checker.issues,
    ok: !checker.issues.some((issue) => issue.severity === "error"),
  };
}

/** Convenience: `{ ok, errors, warnings }` counts for CLI summaries. */
export function summarizeCheckResult(result: PluginCheckResult): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issue of result.issues) {
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}
