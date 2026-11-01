import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMemosTransportHarness,
  createMemosTransportRuntime,
  encodeBase64,
  encodeCreateMemoProto,
  encodeCreateShortcutProto,
  encodeGetMemoProto,
  encodeListMemosProto,
  encodeSignInProto,
  encodeUpdateMemoProto,
  frameProto,
  signInMemosNative,
} from "../test-support/memos-transport";

let mf: Miniflare;
let env: Env;
let accessToken: string;
let refreshCookie: string;

const { connect, connectService, request } = createMemosTransportHarness(
  () => ({
    env,
    accessToken,
  }),
);

describe("Connect binary transports", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createMemosTransportRuntime());
    ({ accessToken, refreshCookie } = await signInMemosNative(env));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("frames gRPC-Web and gRPC-Web text CreateMemo calls", async () => {
    const grpcWebCreate = await request(
      "/memos.api.v1.MemoService/CreateMemo",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/grpc+proto",
        },
        body: frameProto(encodeCreateMemoProto("gRPC framed memo")),
      },
    );
    expect(grpcWebCreate.status).toBe(200);
    expect(grpcWebCreate.headers.get("grpc-status")).toBe("0");
    expect(
      new TextDecoder().decode(await grpcWebCreate.arrayBuffer()),
    ).toContain("gRPC framed memo");

    const grpcWebTextCreate = await request(
      "/memos.api.v1.MemoService/CreateMemo",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/grpc-web-text+proto",
        },
        body: encodeBase64(
          frameProto(encodeCreateMemoProto("gRPC-Web text memo")),
        ),
      },
    );
    expect(grpcWebTextCreate.status).toBe(200);
    expect(grpcWebTextCreate.headers.get("content-type")).toBe(
      "application/grpc-web-text+proto",
    );
    expect(atob(await grpcWebTextCreate.text())).toContain(
      "gRPC-Web text memo",
    );
  });

  it("decodes protobuf and native gRPC memo reads and updates", async () => {
    // Setup only: one JSON-created memo for the binary reads to address. Its
    // DTO shape is asserted by the unary subset test.
    const created = await connect("CreateMemo", {
      memo: { content: "Connect JSON memo" },
    });

    const binaryList = await request("/memos.api.v1.MemoService/ListMemos", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/grpc+proto",
      },
      body: frameProto(encodeListMemosProto()),
    });
    expect(binaryList.status).toBe(200);
    expect(new TextDecoder().decode(await binaryList.arrayBuffer())).toContain(
      "Connect JSON memo",
    );

    const nativeGrpcList = await request(
      "/memos.api.v1.MemoService/ListMemos",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/grpc",
        },
        body: frameProto(encodeListMemosProto()),
      },
    );
    expect(nativeGrpcList.status).toBe(200);
    expect(nativeGrpcList.headers.get("grpc-status")).toBe("0");
    expect(
      new TextDecoder().decode(await nativeGrpcList.arrayBuffer()),
    ).toContain("Connect JSON memo");

    const binaryGet = await request("/memos.api.v1.MemoService/GetMemo", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/proto",
      },
      body: encodeGetMemoProto(created.name),
    });
    expect(binaryGet.status).toBe(200);
    expect(new TextDecoder().decode(await binaryGet.arrayBuffer())).toContain(
      created.name,
    );

    const binaryUpdate = await request("/memos.api.v1.MemoService/UpdateMemo", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/proto",
      },
      body: encodeUpdateMemoProto(created.name),
    });
    expect(binaryUpdate.status).toBe(200);
    const updatedAfterBinary = await connect("GetMemo", { name: created.name });
    expect(updatedAfterBinary.pinned).toBe(true);
  });

  it("handles binary and JSON shortcut mutations", async () => {
    const binaryShortcut = await request(
      "/memos.api.v1.ShortcutService/CreateShortcut",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/grpc-web+proto",
        },
        body: frameProto(encodeCreateShortcutProto()),
      },
    );
    expect(binaryShortcut.status).toBe(200);
    expect(
      new TextDecoder().decode(await binaryShortcut.arrayBuffer()),
    ).toContain("Transport shortcut");

    const missingShortcutParent = await request(
      "/memos.api.v1.ShortcutService/CreateShortcut",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          shortcut: { title: "Missing parent", filter: "pinned == true" },
        }),
      },
    );
    expect(missingShortcutParent.status).toBe(400);

    const validatedShortcut = await connectService(
      "ShortcutService",
      "CreateShortcut",
      {
        parent: "users/owner",
        shortcut: { title: "Validated shortcut", filter: "pinned == true" },
        validateOnly: true,
      },
    );
    expect(validatedShortcut.name).toMatch(/^users\/owner\/shortcuts\//u);

    const shortcut = await connectService("ShortcutService", "CreateShortcut", {
      parent: "users/owner",
      shortcut: { title: "Transport shortcut", filter: "pinned == true" },
    });
    const updatedShortcut = await connectService(
      "ShortcutService",
      "UpdateShortcut",
      {
        shortcut: {
          name: shortcut.name,
          title: "Updated transport shortcut",
          filter: "pinned == false",
        },
        updateMask: { paths: ["title"] },
      },
    );
    expect(updatedShortcut).toMatchObject({
      name: shortcut.name,
      title: "Updated transport shortcut",
      filter: "pinned == true",
    });
    const listedShortcuts = await connectService(
      "ShortcutService",
      "ListShortcuts",
      { parent: "users/owner" },
    );
    expect(listedShortcuts.shortcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: shortcut.name }),
      ]),
    );
    await connectService("ShortcutService", "DeleteShortcut", {
      name: shortcut.name,
    });
  });

  it("serves binary auth and rejects compressed and unauthenticated frames", async () => {
    const authBinary = await request("/memos.api.v1.AuthService/SignIn", {
      method: "POST",
      headers: {
        "content-type": "application/proto",
        origin: "http://flaremo.test",
      },
      body: encodeSignInProto(),
    });
    expect(authBinary.status).toBe(200);
    expect(new TextDecoder().decode(await authBinary.arrayBuffer())).toContain(
      "users/owner",
    );

    const binarySignOut = await request("/memos.api.v1.AuthService/SignOut", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: refreshCookie,
        "content-type": "application/proto",
        origin: "http://flaremo.test",
      },
      body: new Uint8Array(),
    });
    expect(binarySignOut.status).toBe(200);
    expect(binarySignOut.headers.get("content-type")).toBe("application/proto");
    expect(new Uint8Array(await binarySignOut.arrayBuffer())).toHaveLength(0);

    const compressed = await request("/memos.api.v1.MemoService/CreateMemo", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/grpc+proto",
      },
      body: Uint8Array.of(1, 0, 0, 0, 0),
    });
    expect(compressed.status).toBe(400);

    const unauthenticatedBinary = await request(
      "/memos.api.v1.UserService/ListUsers",
      {
        method: "POST",
        headers: { "content-type": "application/grpc+proto" },
        body: frameProto(new Uint8Array()),
      },
    );
    expect(unauthenticatedBinary.status).toBe(401);
    expect(unauthenticatedBinary.headers.get("grpc-status")).toBe("16");
  });
});
