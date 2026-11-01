import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { createAppTestHarness } from "../test-support/app";
import { createTestRuntime, TEST_PASSWORD } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { extractCookieHeader, bootstrapAndSignIn } = createAppTestHarness(
  () => ({
    env,
    sessionCookie,
  }),
);

describe("FlareMo rate limiting and account deletion", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createTestRuntime({
      databaseName: "flaremo-test",
      attachmentsName: "flaremo-attachments-test",
      env: { FLAREMO_DEPLOY_REPOSITORY: "example/flaremo" },
    }));
    sessionCookie = await bootstrapAndSignIn();
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("throttles credential endpoints when the rate limiter binding is set", async () => {
    const keys: string[] = [];
    const limitedEnv = {
      ...env,
      RATE_LIMITER: {
        limit: async (input: { key: string }) => {
          keys.push(input.key);
          return { success: false };
        },
      },
    } as Env;

    const denied = await app.fetch(
      new Request("http://flaremo.test/api/auth/flaremo/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
          "cf-connecting-ip": "203.0.113.7",
        },
        body: JSON.stringify({
          name: "Member",
          email: "rate-limit@example.com",
          password: TEST_PASSWORD,
        }),
      }),
      limitedEnv,
    );
    expect(denied.status).toBe(429);
    expect(keys[0]).toBe("register:203.0.113.7");

    const signInDenied = await app.fetch(
      new Request("http://flaremo.test/api/auth/sign-in/username", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
          "cf-connecting-ip": "203.0.113.7",
        },
        body: JSON.stringify({ username: "owner", password: TEST_PASSWORD }),
      }),
      limitedEnv,
    );
    expect(signInDenied.status).toBe(429);
    expect(keys).toContain("auth:203.0.113.7");

    // Session reads bypass the limiter entirely.
    const sessionRead = await app.fetch(
      new Request("http://flaremo.test/api/auth/get-session", {
        headers: { "cf-connecting-ip": "203.0.113.7" },
      }),
      limitedEnv,
    );
    expect(sessionRead.status).toBe(200);
    expect(keys).toHaveLength(2);
  });

  it("lets a member delete their own account after password confirmation", async () => {
    const open = await app.fetch(
      new Request("http://flaremo.test/api/app/admin/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({ registration_open: true }),
      }),
      env,
    );
    expect(open.status).toBe(200);

    const register = await app.fetch(
      new Request("http://flaremo.test/api/auth/flaremo/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          name: "Doomed",
          email: "doomed@example.com",
          password: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(register.status).toBe(201);

    const signIn = await app.fetch(
      new Request("http://flaremo.test/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          email: "doomed@example.com",
          password: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(signIn.status).toBe(200);
    const memberCookie = extractCookieHeader(signIn);

    const memo = await app.fetch(
      new Request("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
          cookie: memberCookie,
        },
        body: JSON.stringify({ content: "goodbye" }),
      }),
      env,
    );
    expect(memo.status).toBe(200);

    // The owner cannot self-delete through the app.
    const ownerDelete = await app.fetch(
      new Request("http://flaremo.test/api/app/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
          cookie: sessionCookie,
        },
        body: JSON.stringify({ current_password: TEST_PASSWORD }),
      }),
      env,
    );
    expect(ownerDelete.status).toBe(403);

    // Wrong password refused; correct password deletes identity and data.
    const wrongDelete = await app.fetch(
      new Request("http://flaremo.test/api/app/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
          cookie: memberCookie,
        },
        body: JSON.stringify({ current_password: "wrong-password-123" }),
      }),
      env,
    );
    expect(wrongDelete.status).toBe(400);

    const deleted = await app.fetch(
      new Request("http://flaremo.test/api/app/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
          cookie: memberCookie,
        },
        body: JSON.stringify({ current_password: TEST_PASSWORD }),
      }),
      env,
    );
    expect(deleted.status).toBe(200);

    const reSignIn = await app.fetch(
      new Request("http://flaremo.test/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          email: "doomed@example.com",
          password: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(reSignIn.status).toBe(401);

    // The member's memo is gone with the account.
    const list = await app.fetch(
      new Request("http://flaremo.test/api/v1/memos", {
        headers: { cookie: memberCookie },
      }),
      env,
    );
    expect(list.status).toBe(401);

    // The freed email can register again.
    const reRegister = await app.fetch(
      new Request("http://flaremo.test/api/auth/flaremo/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          name: "Doomed",
          email: "doomed@example.com",
          password: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(reRegister.status).toBe(201);
  });
});
