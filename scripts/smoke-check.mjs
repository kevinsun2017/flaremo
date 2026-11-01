#!/usr/bin/env node

// Verify the freshly deployed Worker actually serves traffic. Reads the
// public origin from wrangler.jsonc and polls it until the server responds,
// so a silent publish failure fails the deploy workflow instead of surfacing
// when the user opens /setup.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";

const ATTEMPTS = 12;
const RETRY_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;

export function publicOriginFromConfig(source, configPath) {
  const parseErrors = [];
  const config = parseJsonc(source, parseErrors, { allowTrailingComma: true });
  if (parseErrors.length > 0) {
    throw new Error(
      `Cannot parse ${configPath}: ${parseErrors
        .map((error) => printParseErrorCode(error.error))
        .join(", ")}`,
    );
  }
  const origin = config?.vars?.FLAREMO_PUBLIC_URL;
  if (!origin || typeof origin !== "string") {
    throw new Error(
      `${configPath} has no vars.FLAREMO_PUBLIC_URL to smoke check.`,
    );
  }
  return origin;
}

export function isServiceable(status) {
  return status > 0 && status < 500;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Smoke check failed.",
    );
    process.exit(1);
  });
}

async function main() {
  const configPath = resolve("wrangler.jsonc");
  const origin = publicOriginFromConfig(
    readFileSync(configPath, "utf8"),
    configPath,
  );
  await checkOrigin(origin);
  console.log(`Smoke check passed: ${origin} is serving traffic.`);
}

export async function checkOrigin(
  origin,
  { attempts = ATTEMPTS, delayMs = RETRY_DELAY_MS, fetchImpl = fetch } = {},
) {
  let lastProblem = "no attempts were made";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${origin}/`, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (isServiceable(response.status)) {
        if (attempt > 1) console.log(`Received HTTP ${response.status}.`);
        return response.status;
      }
      lastProblem = `HTTP ${response.status}`;
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) {
      console.log(
        `Attempt ${attempt}/${attempts} failed (${lastProblem}); retrying in ${Math.round(delayMs / 1000)}s...`,
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
  throw new Error(
    `${origin} did not respond with a servable status after ${attempts} attempts (last: ${lastProblem}). The Worker was published; check DNS for the origin and the Cloudflare dashboard build/deploy logs.`,
  );
}
