import { applyFlaremoMigrations } from "@flaremo/db";
import { Miniflare } from "miniflare";
import worker from "../index";

/**
 * Vitest-only Worker harness. Every suite boots its own Miniflare instance with
 * a D1 database and an R2 bucket wired into an `Env`-shaped binding bag, so the
 * tests drive the real Worker entrypoint instead of hand-rolled doubles.
 */

export const TEST_AUTH_SECRET =
  "test-better-auth-secret-that-is-never-used-in-production";
export const TEST_BOOTSTRAP_SECRET =
  "test-bootstrap-secret-that-is-never-used-in-production";
export const TEST_PASSWORD = "test-password-not-for-production-123";

type WorkerFetchHandler = (
  request: Request,
  env: Env,
) => Response | Promise<Response>;

/**
 * Call the Worker's fetch handler the way the suites always have: two
 * arguments, because no `ExecutionContext` exists in a unit test and the
 * handler's post-response outbox sweeps are `ctx?.waitUntil`-guarded.
 * The default export types `fetch` as optional (the handler contract allows
 * partial handlers); the exported worker always provides it.
 */
export function fetchWorker(
  request: Request,
  env: Env,
): Response | Promise<Response> {
  return (worker.fetch as WorkerFetchHandler)(request, env);
}

export interface TestRuntime {
  runtime: Miniflare;
  db: D1Database;
  env: Env;
}

/**
 * Binding overrides. Deliberately loose: the per-suite harnesses built the bag
 * as a plain object and cast it with `as Env`, so they could set values the
 * generated `Env` types as literals (`""`) or omits entirely (secrets).
 */
export type TestEnvOverrides = Record<string, unknown>;

export interface TestRuntimeOptions {
  /** Prefix of the default binding names (`<name>-<suffix>`). */
  name?: string;
  /** Unique fragment of the default binding names; defaults to a fresh uuid. */
  suffix?: string;
  /** Exact D1 database name; defaults to `${name}-${suffix}`. */
  databaseName?: string;
  /** Exact R2 bucket name; defaults to `${name}-attachments-${suffix}`. */
  attachmentsName?: string;
  /** `BETTER_AUTH_SECRET`; defaults to TEST_AUTH_SECRET. */
  authSecret?: string;
  /** `FLAREMO_BOOTSTRAP_SECRET`; pass null to leave the binding unset. */
  bootstrapSecret?: string | null;
  /** Extra bindings merged over the harness defaults. */
  env?: TestEnvOverrides;
}

/**
 * Apply the migrations to a fresh D1 database and return the instance together
 * with its bindings. Callers own disposal: `await runtime.dispose()`.
 */
export async function createTestRuntime(
  options: TestRuntimeOptions = {},
): Promise<TestRuntime> {
  const name = options.name ?? "flaremo-test";
  const suffix = options.suffix ?? crypto.randomUUID();
  const runtime = new Miniflare({
    script: "export default { fetch() { return new Response('ok') } }",
    modules: true,
    compatibilityDate: "2026-07-10",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: options.databaseName ?? `${name}-${suffix}` },
    r2Buckets: {
      ATTACHMENTS: options.attachmentsName ?? `${name}-attachments-${suffix}`,
    },
  });
  const db = await runtime.getD1Database("DB");
  await applyFlaremoMigrations(db);

  // The bindings bag is deliberately assembled as a plain object: suites set
  // values the generated `Env` types as literals (`""`) or omits entirely
  // (secrets), so this cast is the same escape hatch the inline harnesses used.
  const env = {
    DB: db,
    ATTACHMENTS: await runtime.getR2Bucket("ATTACHMENTS"),
    ASSETS: {
      fetch: async () => new Response("asset", { status: 200 }),
    } as unknown as Fetcher,
    FLAREMO_SINGLE_USER_EMAIL: "owner@example.com",
    FLAREMO_SINGLE_USER_NAME: "Owner",
    FLAREMO_PUBLIC_URL: "http://flaremo.test",
    BETTER_AUTH_SECRET: options.authSecret ?? TEST_AUTH_SECRET,
    ...(options.bootstrapSecret === null
      ? {}
      : {
          FLAREMO_BOOTSTRAP_SECRET:
            options.bootstrapSecret ?? TEST_BOOTSTRAP_SECRET,
        }),
    ...options.env,
  } as unknown as Env;

  return { runtime, db, env };
}
