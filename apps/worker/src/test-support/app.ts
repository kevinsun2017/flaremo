import { expect } from "vitest";
import { fetchWorker, TEST_PASSWORD } from "./runtime";
import {
  extractCookieHeader,
  bootstrapAndSignIn as signInOwner,
} from "./sign-in";

/**
 * Vitest-only request helpers for the Worker HTTP surface. Suites keep their
 * own module-level `env`/`sessionCookie` (recreated per test); the harness
 * reads them on every call, so a rebuilt runtime or a re-issued session cookie
 * is picked up without rebinding the helpers.
 */

/** Assert the response is OK and parse its JSON body. */
export async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
}

/** Assert the response carries `status` and parse its JSON body. */
export async function jsonWithStatus<T = Record<string, unknown>>(
  response: Response,
  status = 200,
): Promise<T> {
  expect(response.status).toBe(status);
  return response.json() as Promise<T>;
}

export interface AppTestContext {
  env: Env;
  sessionCookie: string;
}

/** The request shape every suite drives the Worker through. */
export type AppFetch = (
  input: string,
  init?: RequestInit,
  options?: { authenticated?: boolean },
) => Response | Promise<Response>;

function isUnsafeMethod(method: string | undefined) {
  return !["GET", "HEAD", "OPTIONS"].includes((method ?? "GET").toUpperCase());
}

export function createAppTestHarness(read: () => AppTestContext) {
  const fetchApp: AppFetch = (
    input: string,
    init?: RequestInit,
    options: { authenticated?: boolean } = {},
  ) => {
    const { env, sessionCookie } = read();
    const headers = new Headers(init?.headers);
    const path = new URL(input).pathname;
    if (
      options.authenticated !== false &&
      (path.startsWith("/api/app/") || path.startsWith("/api/v1/"))
    ) {
      headers.set("cookie", sessionCookie);
      if (path.startsWith("/api/v1/") && !headers.has("x-flaremo-wire")) {
        headers.set("x-flaremo-wire", "legacy");
      }
      if (!headers.has("origin") && isUnsafeMethod(init?.method)) {
        headers.set("origin", "http://flaremo.test");
      }
    }
    return fetchWorker(new Request(input, { ...init, headers }), env);
  };

  const fetchCurrent: AppFetch = (
    input: string,
    init?: RequestInit,
    options: { authenticated?: boolean } = {},
  ) => {
    const headers = new Headers(init?.headers);
    headers.set("x-flaremo-wire", "current");
    return fetchApp(input, { ...init, headers }, options);
  };

  const bootstrapAndSignIn = () => signInOwner(read().env);

  async function createMemo<T = Record<string, unknown>>(content: string) {
    return json<T>(
      await fetchApp("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    );
  }

  async function uploadAttachment<T = Record<string, unknown>>(
    memoName: string,
  ) {
    const formData = new FormData();
    formData.set("memo", memoName);
    formData.set(
      "file",
      new File(["payload"], "file.txt", {
        type: "text/plain",
      }),
    );
    return json<T>(
      await fetchApp("http://flaremo.test/api/v1/attachments", {
        method: "POST",
        body: formData,
      }),
    );
  }

  /**
   * Create a member through the admin API, activate the one-time reset link,
   * and sign in. Returns the domain user id and the member's session cookie.
   */
  async function createActivatedMember(email: string, name: string) {
    const { env } = read();
    const created = await json<{ id: string; activation_path: string }>(
      await fetchApp("http://flaremo.test/api/app/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email }),
      }),
    );
    expect(created.id).toMatch(/^users\//);
    const activationToken = new URL(
      `http://flaremo.test${created.activation_path}`,
    ).searchParams.get("token");
    expect(activationToken).toBeTruthy();

    const reset = await fetchWorker(
      new Request("http://flaremo.test/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          token: activationToken,
          newPassword: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(reset.status).toBe(200);

    const signIn = await fetchWorker(
      new Request("http://flaremo.test/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({ email, password: TEST_PASSWORD }),
      }),
      env,
    );
    expect(signIn.status).toBe(200);
    return { id: created.id, cookie: extractCookieHeader(signIn) };
  }

  async function createMemoAs(
    cookie: string,
    content: string,
    visibility: "private" | "protected" | "public",
  ) {
    const { env } = read();
    // The app DTO exposes the bare uuid as `id` and the row id as `name`.
    const created = await json<{ id: string; name: string }>(
      await fetchWorker(
        new Request("http://flaremo.test/api/app/memos", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
            origin: "http://flaremo.test",
          },
          body: JSON.stringify({ content, visibility }),
        }),
        env,
      ),
    );
    expect(created.name).toMatch(/^memos\//);
    expect(created.id).toBe(created.name.replace(/^memos\//, ""));
    return created.id;
  }

  return {
    fetchApp,
    fetchCurrent,
    bootstrapAndSignIn,
    createMemo,
    uploadAttachment,
    createActivatedMember,
    createMemoAs,
    extractCookieHeader,
  };
}
