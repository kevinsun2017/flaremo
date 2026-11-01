import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMemosTransportHarness,
  createMemosTransportRuntime,
  encodeCreateMemoProto,
  signInMemosNative,
} from "../test-support/memos-transport";

let mf: Miniflare;
let env: Env;
let accessToken: string;
let sessionCookie: string;

const { request } = createMemosTransportHarness(() => ({ env, accessToken }));

describe("Connect transport boundaries", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createMemosTransportRuntime());
    ({ accessToken, sessionCookie } = await signInMemosNative(env));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("serves the anonymous Connect surface and rejects untrusted origins", async () => {
    const publicProfile = await request(
      "/memos.api.v1.InstanceService/GetInstanceProfile",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(publicProfile.status).toBe(200);
    const publicProfileBody = (await publicProfile.json()) as {
      needsSetup: boolean;
      admin?: { email?: string };
    };
    expect(publicProfileBody).toMatchObject({ needsSetup: false });
    expect(publicProfileBody.admin?.email).toBeUndefined();
    const publicProviders = await request(
      "/memos.api.v1.IdentityProviderService/ListIdentityProviders",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(publicProviders.status).toBe(200);
    expect(await publicProviders.json()).toEqual({ identityProviders: [] });
    const publicSensitiveSettings = await request(
      "/memos.api.v1.InstanceService/BatchGetInstanceSettings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names: ["instance/settings/STORAGE"] }),
      },
    );
    expect(publicSensitiveSettings.status).toBe(401);
    const publicWithWrongBearerOrigin = await request(
      "/memos.api.v1.InstanceService/GetInstanceProfile",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    expect(publicWithWrongBearerOrigin.status).toBe(403);
    const publicWithWrongCookieOrigin = await request(
      "/memos.api.v1.InstanceService/GetInstanceProfile",
      {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    expect(publicWithWrongCookieOrigin.status).toBe(403);
  });

  it("rejects unsupported media types and cookie mutations without an origin", async () => {
    const connectPath = "/memos.api.v1.MemoService/CreateMemo";
    const unsupported = await request(connectPath, {
      method: "POST",
      headers: { "content-type": "application/proto" },
      body: "binary-not-supported",
    });
    expect(unsupported.status).toBe(400);

    const binaryCreate = await request(connectPath, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/proto",
      },
      body: encodeCreateMemoProto("Connect protobuf memo"),
    });
    expect(binaryCreate.status).toBe(200);
    expect(binaryCreate.headers.get("content-type")).toBe("application/proto");
    expect((await binaryCreate.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const missingOriginCookieMutation = await request(connectPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({ memo: { content: "must require origin" } }),
    });
    expect(missingOriginCookieMutation.status).toBe(403);
  });

  it("returns the link-metadata auth boundary before URL validation", async () => {
    // Link metadata drives a server-side fetch, so it now sits behind auth:
    // unauthenticated callers get 401 before any URL validation. The fetch
    // rules themselves (internal-IP blocks, content types) stay covered by
    // the memos-link-metadata unit tests.
    const invalidLink = await request(
      "/memos.api.v1.MemoService/GetLinkMetadata",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1/" }),
      },
    );
    expect(invalidLink.status).toBe(401);
    const emptyBinaryLink = await request(
      "/memos.api.v1.MemoService/GetLinkMetadata",
      {
        method: "POST",
        headers: { "content-type": "application/proto" },
        body: new Uint8Array(),
      },
    );
    // An empty proto frame decodes to an empty message; the request then hits
    // the auth boundary, which reports 401 / UNAUTHENTICATED (grpc code 16).
    expect(emptyBinaryLink.status).toBe(401);
    expect(emptyBinaryLink.headers.get("grpc-status")).toBe("16");
    const emptyBatch = await request(
      "/memos.api.v1.MemoService/BatchGetLinkMetadata",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: [] }),
      },
    );
    expect(emptyBatch.status).toBe(401);
  });
});
