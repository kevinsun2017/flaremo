import { FLAREMO_API_VERSION } from "@flaremo/contracts";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAppTestHarness,
  jsonWithStatus as json,
} from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";
import { bootstrapAndSignIn } from "../test-support/sign-in";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp } = createAppTestHarness(() => ({ env, sessionCookie }));

describe("Memos-compatible OpenAPI document", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createTestRuntime({
      name: "flaremo-memos-compat",
      suffix: "source",
    }));
    sessionCookie = await bootstrapAndSignIn(env);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("documents every supported public path in OpenAPI", async () => {
    const openapi = await json(
      await fetchApp("http://flaremo.test/openapi.json", {
        headers: { "x-flaremo-wire": "legacy" },
      }),
    );
    expect(openapi.info.version).toBe(FLAREMO_API_VERSION);
    const paths = Object.keys(openapi.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/memos",
        "/api/v1/memos/{id}",
        "/api/v1/memos/{id}/attachments",
        "/api/v1/memos/{id}/context",
        "/api/v1/memos/{id}/relation-context",
        "/api/v1/memos/{id}/relations",
        "/api/v1/memos/{id}/revisions",
        "/api/v1/memos/{id}/revisions/restore",
        "/api/v1/memos/{id}/shares",
        "/api/v1/shares/{share_id}",
        "/api/public/shares/{token}",
        "/api/public/shares/{token}/attachments/{id}/blob",
        "/api/v1/attachments",
        "/api/v1/attachments/{id}",
        "/api/v1/attachments/{id}/blob",
        "/api/v1/export",
        "/api/v1/import",
        "/api/v1/mcp",
        "/openapi.json",
      ]),
    );
  });
});
