import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMemosRefreshCookie } from "../memos-native-auth";
import {
  createMemosTransportHarness,
  createMemosTransportRuntime,
  findCookie,
  setCookiePairs,
  setCookieValues,
  signInMemosNative,
  signTestJwt,
  TEST_AUTH_SECRET,
  TEST_PASSWORD,
} from "../test-support/memos-transport";

let mf: Miniflare;
let env: Env;
let accessToken: string;
let sessionCookie: string;
let refreshCookie: string;
let opaqueSessionToken: string;
let refreshSetCookie: string;

const { request } = createMemosTransportHarness(() => ({ env, accessToken }));

describe("Memos native auth boundaries", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createMemosTransportRuntime());
    ({
      accessToken,
      opaqueSessionToken,
      sessionCookie,
      refreshCookie,
      refreshSetCookie,
    } = await signInMemosNative(env));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("refuses compat signups when email verification is required", async () => {
    // Open registration first so the email gate, not the closed switch, is
    // what rejects these signups.
    const open = await request("/api/app/admin/settings", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "http://flaremo.test",
        cookie: sessionCookie,
      },
      body: JSON.stringify({ registration_open: true }),
    });
    expect(open.status).toBe(200);

    env.FLAREMO_EMAIL_PROVIDER = "cloudflare";
    env.FLAREMO_EMAIL_FROM = "no-reply@flaremo.test";
    (env as unknown as { EMAIL: unknown }).EMAIL = {
      send: async () => ({ ok: true }),
    };

    // Memos current REST signup.
    const currentSignup = await request("/api/v1/auth/signup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://flaremo.test",
      },
      body: JSON.stringify({
        username: "compat-user",
        password: TEST_PASSWORD,
      }),
    });
    expect(currentSignup.status).toBe(403);

    // Connect protocol SignUp.
    const connectSignup = await request("/memos.api.v1.AuthService/SignUp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "connect-protocol-version": "1",
        origin: "http://flaremo.test",
      },
      body: JSON.stringify({
        username: "compat-user",
        password: TEST_PASSWORD,
      }),
    });
    expect(connectSignup.status).toBe(403);
  });

  it("rejects malformed, forged, expired, and wrongly-scoped native JWTs", async () => {
    const validClaims = {
      type: "access",
      role: "ADMIN",
      status: "NORMAL",
      username: "owner",
      iss: "memos",
      sub: "1",
      aud: ["user.access-token"],
      iat: Math.floor(Date.now() / 1_000),
      exp: Math.floor(Date.now() / 1_000) + 900,
    };

    const forged = await signTestJwt(validClaims, "wrong-secret");
    const wrongAudience = await signTestJwt(
      { ...validClaims, aud: ["wrong-audience"] },
      TEST_AUTH_SECRET,
    );
    const wrongKeyId = await signTestJwt(validClaims, TEST_AUTH_SECRET, {
      alg: "HS256",
      kid: "v2",
      typ: "JWT",
    });
    const wrongAlgorithm = await signTestJwt(validClaims, TEST_AUTH_SECRET, {
      alg: "HS512",
      kid: "v1",
      typ: "JWT",
    });
    const expired = await signTestJwt(
      { ...validClaims, exp: validClaims.iat - 1 },
      TEST_AUTH_SECRET,
    );

    for (const token of [
      "not-a-jwt",
      forged,
      wrongAudience,
      wrongKeyId,
      wrongAlgorithm,
      expired,
    ]) {
      const response = await request("/api/v1/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(401);
    }

    const native = await request("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(native.status).toBe(200);
    expect(await native.json()).toMatchObject({
      user: { name: "users/owner", username: "owner" },
    });

    const opaqueSession = await request("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${opaqueSessionToken}` },
    });
    expect(opaqueSession.status).toBe(200);
  });

  it("rotates and revokes memos_refresh with secure cookie attributes", async () => {
    expect(refreshSetCookie).toContain("HttpOnly");
    expect(refreshSetCookie).toContain("SameSite=Lax");
    expect(refreshSetCookie).toContain("Path=/");
    expect(refreshSetCookie).not.toContain("Secure");

    const secureCookie = buildMemosRefreshCookie(
      new Request("https://flaremo.test"),
      "fixture-refresh-token",
      new Date("2030-01-01T00:00:00.000Z"),
    );
    expect(secureCookie).toContain("HttpOnly");
    expect(secureCookie).toContain("SameSite=Lax");
    expect(secureCookie).toContain("Secure");

    const rotated = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: refreshCookie,
        origin: "http://flaremo.test",
      },
    });
    expect(rotated.status).toBe(200);
    const rotatedCookies = setCookiePairs(rotated);
    const nextRefreshCookie = findCookie(rotatedCookies, "memos_refresh");
    expect(nextRefreshCookie).not.toBe(refreshCookie);
    expect((await rotated.json()) as { accessToken: string }).toMatchObject({
      accessToken: expect.any(String),
    });

    const reused = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: refreshCookie,
        origin: "http://flaremo.test",
      },
    });
    expect(reused.status).toBe(401);

    const signedOut = await request("/api/v1/auth/signout", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: nextRefreshCookie,
        origin: "http://flaremo.test",
      },
    });
    expect(signedOut.status).toBe(200);
    const cleared = findCookie(setCookieValues(signedOut), "memos_refresh");
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");

    const afterSignout = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: nextRefreshCookie,
        origin: "http://flaremo.test",
      },
    });
    expect(afterSignout.status).toBe(401);
  });
});
