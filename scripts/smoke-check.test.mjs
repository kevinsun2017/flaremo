import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOrigin,
  isServiceable,
  publicOriginFromConfig,
} from "./smoke-check.mjs";

test("reads FLAREMO_PUBLIC_URL from the wrangler config", () => {
  const origin = publicOriginFromConfig(
    '{"vars": {"FLAREMO_PUBLIC_URL": "https://notes.example.com"}}',
    "wrangler.jsonc",
  );
  assert.equal(origin, "https://notes.example.com");
});

test("rejects configs without a public URL", () => {
  assert.throws(
    () => publicOriginFromConfig('{"vars": {}}', "wrangler.jsonc"),
    /FLAREMO_PUBLIC_URL/,
  );
});

test("treats 2xx-4xx as servable and 5xx as down", () => {
  assert.equal(isServiceable(200), true);
  assert.equal(isServiceable(404), true);
  assert.equal(isServiceable(503), false);
});

test("checkOrigin retries transient failures and recovers", async () => {
  const responses = [null, { status: 200 }];
  const status = await checkOrigin("https://smoke.example.com", {
    attempts: 2,
    delayMs: 1,
    fetchImpl: async () => {
      const next = responses.shift();
      if (!next) throw new Error("socket hang up");
      return next;
    },
  });
  assert.equal(status, 200);
});

test("checkOrigin throws after exhausting attempts", async () => {
  await assert.rejects(
    () =>
      checkOrigin("https://smoke-down.example.com", {
        attempts: 2,
        delayMs: 1,
        fetchImpl: async () => ({ status: 503 }),
      }),
    /did not respond/,
  );
});
