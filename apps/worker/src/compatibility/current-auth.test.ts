import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppTestHarness } from "../test-support/app";
import { createTestRuntime, TEST_PASSWORD } from "../test-support/runtime";
import {
  bootstrapAndSignIn,
  extractCookieHeader,
} from "../test-support/sign-in";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp, fetchCurrent } = createAppTestHarness(() => ({
  env,
  sessionCookie,
}));

describe("Current wire auth surface", () => {
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

  it("serves the current camelCase REST facade on top of Better Auth", async () => {
    const currentOpenapi = await fetchCurrent(
      "http://flaremo.test/openapi.json",
      undefined,
      { authenticated: false },
    );
    expect(currentOpenapi.status).toBe(200);
    const currentOpenapiBody = await currentOpenapi.json();
    expect(currentOpenapiBody).toMatchObject({
      info: { title: "FlareMo current Memos-compatible API" },
      paths: {
        "/api/v1/auth/signin": expect.any(Object),
        "/api/v1/memos": expect.any(Object),
        "/file/attachments/{attachment}/{filename}": expect.any(Object),
        "/memos.api.v1.MemoService/GetMemoByShare": expect.any(Object),
        "/memos.api.v1.AttachmentService/ListAttachments": expect.any(Object),
        "/memos.api.v1.InstanceService/GetInstanceProfile": expect.any(Object),
        "/mcp": expect.any(Object),
      },
    });
    expect(
      currentOpenapiBody.paths["/memos.api.v1.MemoService/GetMemo"].post
        .security,
    ).toEqual(expect.arrayContaining([{}]));

    const legacyOpenapi = await fetchApp(
      "http://flaremo.test/openapi.json",
      { headers: { "x-flaremo-wire": "legacy" } },
      { authenticated: false },
    );
    expect(legacyOpenapi.status).toBe(200);
    expect(await legacyOpenapi.json()).toMatchObject({
      info: { title: "FlareMo Memos-compatible API" },
    });

    const missingOriginSignIn = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/signin",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passwordCredentials: {
            username: "owner",
            password: TEST_PASSWORD,
          },
        }),
      },
      { authenticated: false },
    );
    expect(missingOriginSignIn.status).toBe(403);

    const signInResponse = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/signin",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          passwordCredentials: {
            username: "owner",
            password: TEST_PASSWORD,
          },
        }),
      },
      { authenticated: false },
    );
    expect(signInResponse.status).toBe(200);
    expect(signInResponse.headers.get("set-cookie")).toBeTruthy();
    expect(signInResponse.headers.get("cache-control")).toBe("no-store");
    const signIn = (await signInResponse.json()) as {
      accessToken: string;
      user: { name: string; role: string; username: string };
      accessTokenExpiresAt: string;
    };
    expect(signIn).toMatchObject({
      accessToken: expect.any(String),
      accessTokenExpiresAt: expect.any(String),
      user: {
        name: "users/owner",
        role: "ADMIN",
        username: "owner",
      },
    });

    const signInClaims = decodeJwtForTest(signIn.accessToken);
    expect(signInClaims.header).toEqual({
      alg: "HS256",
      kid: "v1",
      typ: "JWT",
    });
    expect(signInClaims.payload).toMatchObject({
      type: "access",
      role: "ADMIN",
      status: "NORMAL",
      username: "owner",
      iss: "memos",
      sub: "1",
      aud: ["user.access-token"],
    });
    const accessPayloadJson = new TextDecoder().decode(
      decodeBase64UrlForTest(signIn.accessToken.split(".")[1] ?? ""),
    );
    expect(accessPayloadJson).toMatch(
      /^\{"type":"access","role":"ADMIN","status":"NORMAL","username":"owner","iss":"memos","sub":"1","aud":\["user\.access-token"\],"exp":\d+,"iat":\d+\}$/,
    );

    const bearer = { authorization: `Bearer ${signIn.accessToken}` };
    const signInCookie = extractCookieHeader(signInResponse);
    const refreshWithoutCookie = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/refresh",
      { method: "POST", headers: bearer },
      { authenticated: false },
    );
    expect(refreshWithoutCookie.status).toBe(401);

    const refreshWithUntrustedOrigin = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/refresh",
      {
        method: "POST",
        headers: {
          ...bearer,
          cookie: signInCookie,
          origin: "https://untrusted.example",
        },
      },
      { authenticated: false },
    );
    expect(refreshWithUntrustedOrigin.status).toBe(403);

    const refreshResponse = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/refresh",
      {
        method: "POST",
        headers: {
          ...bearer,
          cookie: signInCookie,
          origin: "http://flaremo.test",
        },
      },
      { authenticated: false },
    );
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.headers.get("cache-control")).toBe("no-store");
    const refreshed = (await refreshResponse.json()) as {
      accessToken: string;
      expiresAt: string;
    };
    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(extractCookieHeader(refreshResponse)).not.toBe(signInCookie);
    expect(decodeJwtForTest(refreshed.accessToken).payload).toMatchObject({
      type: "access",
      sub: "1",
      aud: ["user.access-token"],
    });

    const oldRefreshCookieReuse = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/refresh",
      {
        method: "POST",
        headers: {
          ...bearer,
          cookie: signInCookie,
          origin: "http://flaremo.test",
        },
      },
      { authenticated: false },
    );
    expect(oldRefreshCookieReuse.status).toBe(401);

    const meResponse = await fetchCurrent(
      "http://flaremo.test/api/v1/auth/me",
      { headers: bearer },
    );
    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toMatchObject({
      user: { name: "users/owner", username: "owner" },
    });
  });
});

function decodeJwtForTest(token: string) {
  const [encodedHeader, encodedPayload] = token.split(".");
  if (!encodedHeader || !encodedPayload) throw new Error("invalid test JWT");
  const decode = (value: string) =>
    JSON.parse(
      Buffer.from(
        value.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as Record<string, unknown>;
  return { header: decode(encodedHeader), payload: decode(encodedPayload) };
}

function decodeBase64UrlForTest(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
