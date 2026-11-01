import { expect } from "vitest";
import { createTestRuntime, fetchWorker } from "./runtime";

/**
 * Vitest-only harness for the Memos native transport suites. Every suite boots
 * its own Miniflare runtime (same bindings, same secrets) and signs in through
 * the real bootstrap and sign-in endpoints, then drives Connect and protobuf
 * requests through the Worker entrypoint instead of hand-rolled doubles.
 */

export const TEST_AUTH_SECRET =
  "transport-test-better-auth-secret-never-used-in-production";
export const TEST_BOOTSTRAP_SECRET =
  "transport-test-bootstrap-secret-never-used-in-production";
export const TEST_PASSWORD = "transport-test-password-never-production-123";

/** Boot the runtime shared by the transport suites. Callers own disposal. */
export function createMemosTransportRuntime() {
  return createTestRuntime({
    name: "flaremo-transport",
    authSecret: TEST_AUTH_SECRET,
    bootstrapSecret: TEST_BOOTSTRAP_SECRET,
  });
}

function sendTo(env: Env, path: string, init: RequestInit = {}) {
  return fetchWorker(new Request(`http://flaremo.test${path}`, init), env);
}

export interface MemosNativeSession {
  accessToken: string;
  opaqueSessionToken: string;
  sessionCookie: string;
  refreshCookie: string;
  refreshSetCookie: string;
}

/** Bootstrap the owner and sign in over both the native and opaque endpoints. */
export async function signInMemosNative(env: Env): Promise<MemosNativeSession> {
  const setup = await sendTo(env, "/api/auth/flaremo/bootstrap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://flaremo.test",
      "x-flaremo-bootstrap-secret": TEST_BOOTSTRAP_SECRET,
    },
    body: JSON.stringify({
      username: "owner",
      name: "Owner",
      email: "owner@example.com",
      password: TEST_PASSWORD,
    }),
  });
  expect(setup.status).toBe(201);

  const response = await sendTo(env, "/api/v1/auth/signin", {
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
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { accessToken: string };
  const rawSetCookies = setCookieValues(response);
  const cookies = rawSetCookies.map((value) => value.split(";", 1)[0] ?? "");
  const nativeRefreshCookie = findCookie(cookies, "memos_refresh");
  const nativeRefreshSetCookie = findCookie(rawSetCookies, "memos_refresh");
  const browserCookies = cookies.filter(
    (cookie) => !cookie.startsWith("memos_refresh="),
  );
  expect(browserCookies.length).toBeGreaterThan(0);

  const opaqueResponse = await sendTo(env, "/api/auth/sign-in/username", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://flaremo.test",
    },
    body: JSON.stringify({ username: "owner", password: TEST_PASSWORD }),
  });
  expect(opaqueResponse.status).toBe(200);
  const opaqueBody = (await opaqueResponse.json()) as { token: string };
  return {
    accessToken: body.accessToken,
    opaqueSessionToken: opaqueBody.token,
    sessionCookie: browserCookies.join("; "),
    refreshCookie: nativeRefreshCookie,
    refreshSetCookie: nativeRefreshSetCookie,
  };
}

export interface MemosTransportContext {
  env: Env;
  accessToken: string;
}

/**
 * Suites keep their own module-level `env`/`accessToken` (recreated per test);
 * the harness reads them on every call, so a rebuilt runtime or a re-issued
 * token is picked up without rebinding the helpers.
 */
export function createMemosTransportHarness(read: () => MemosTransportContext) {
  function request(path: string, init: RequestInit = {}) {
    return sendTo(read().env, path, init);
  }

  async function connectService(
    service: string,
    method: string,
    body: Record<string, unknown>,
  ) {
    const response = await request(`/memos.api.v1.${service}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${read().accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async function connect(method: string, body: Record<string, unknown>) {
    return connectService("MemoService", method, body);
  }

  return { request, connect, connectService };
}

export function setCookieValues(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  return (headers.getSetCookie?.() ?? [response.headers.get("set-cookie")])
    .filter((value): value is string => Boolean(value))
    .filter(Boolean);
}

export function setCookiePairs(response: Response) {
  return setCookieValues(response).map((value) => value.split(";", 1)[0] ?? "");
}

export function findCookie(cookies: string[], name: string) {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`test cookie ${name} missing`);
  return cookie;
}

export function encodeCreateMemoProto(content: string) {
  const contentBytes = new TextEncoder().encode(content);
  const memo = Uint8Array.from([
    0x3a,
    contentBytes.length,
    ...contentBytes,
    0x48,
    1,
  ]);
  return Uint8Array.from([0x0a, memo.length, ...memo]);
}

export function encodeListMemosProto() {
  return Uint8Array.of(0x08, 0x0a);
}

export function encodeGetMemoProto(name: string) {
  return encodeStringField(1, name);
}

export function encodeUpdateMemoProto(name: string) {
  const memo = concat(encodeStringField(1, name), Uint8Array.of(0x58, 0x01));
  const updateMask = encodeStringField(1, "pinned");
  return concat(encodeMessageField(1, memo), encodeMessageField(2, updateMask));
}

export function encodeCreateShortcutProto() {
  const shortcut = concat(
    encodeStringField(2, "Transport shortcut"),
    encodeStringField(3, "pinned == true"),
  );
  return concat(
    encodeStringField(1, "users/owner"),
    encodeMessageField(2, shortcut),
  );
}

export function encodeSignInProto() {
  const credentials = concat(
    encodeStringField(1, "owner"),
    encodeStringField(2, TEST_PASSWORD),
  );
  return encodeMessageField(1, credentials);
}

function encodeStringField(field: number, value: string) {
  const bytes = new TextEncoder().encode(value);
  return concat(
    encodeVarint((field << 3) | 2),
    encodeVarint(bytes.length),
    bytes,
  );
}

function encodeMessageField(field: number, value: Uint8Array) {
  return concat(
    encodeVarint((field << 3) | 2),
    encodeVarint(value.length),
    value,
  );
}

function encodeVarint(value: number) {
  const output: number[] = [];
  let current = BigInt(value);
  while (current > 127n) {
    output.push(Number((current & 127n) | 128n));
    current >>= 7n;
  }
  output.push(Number(current));
  return Uint8Array.from(output);
}

export function frameProto(payload: Uint8Array) {
  const frame = new Uint8Array(payload.length + 5);
  new DataView(frame.buffer).setUint32(1, payload.length);
  frame.set(payload, 5);
  return frame;
}

export function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function concat(...values: Uint8Array[]) {
  const output = new Uint8Array(
    values.reduce((length, value) => length + value.length, 0),
  );
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

export async function signTestJwt(
  payload: Record<string, unknown>,
  secret: string,
  header = { alg: "HS256", kid: "v1", typ: "JWT" },
) {
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function encodeBase64Url(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
