import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMemosTransportHarness,
  createMemosTransportRuntime,
  signInMemosNative,
} from "../test-support/memos-transport";

let mf: Miniflare;
let env: Env;
let accessToken: string;

const { connect, request } = createMemosTransportHarness(() => ({
  env,
  accessToken,
}));

describe("Connect JSON memo lifecycle", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createMemosTransportRuntime());
    ({ accessToken } = await signInMemosNative(env));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("serves the canonical Connect JSON unary subset", async () => {
    const created = await connect("CreateMemo", {
      memo: { content: "Connect JSON memo" },
    });
    expect(created).toMatchObject({
      name: expect.stringMatching(/^memos\//),
      content: "Connect JSON memo",
    });

    const publicMemo = await connect("CreateMemo", {
      memo: { content: "Connect public memo", visibility: "PUBLIC" },
    });
    const publicComment = await connect("CreateMemoComment", {
      name: publicMemo.name,
      comment: { content: "Public comment" },
    });
    const anonymousCurrentList = await request("/api/v1/memos");
    expect(anonymousCurrentList.status).toBe(200);
    const anonymousCurrentListBody = (await anonymousCurrentList.json()) as {
      memos: Array<{ name: string }>;
    };
    expect(anonymousCurrentListBody.memos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: publicMemo.name }),
      ]),
    );
    expect(anonymousCurrentListBody.memos).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: created.name })]),
    );
    const anonymousConnectMemo = await request(
      "/memos.api.v1.MemoService/GetMemo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: publicMemo.name }),
      },
    );
    expect(anonymousConnectMemo.status).toBe(200);
    expect(await anonymousConnectMemo.json()).toMatchObject({
      name: publicMemo.name,
    });
    const anonymousConnectPrivate = await request(
      "/memos.api.v1.MemoService/GetMemo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: created.name }),
      },
    );
    expect(anonymousConnectPrivate.status).toBe(404);
    const anonymousComments = await request(
      `/api/v1/${publicMemo.name}/comments`,
    );
    expect(anonymousComments.status).toBe(200);
    expect(await anonymousComments.json()).toMatchObject({
      memos: [expect.objectContaining({ name: publicComment.name })],
    });

    const listed = await connect("ListMemos", {
      pageSize: 10,
      orderBy: "create_time desc",
    });
    expect(listed.memos).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: created.name })]),
    );

    const fetched = await connect("GetMemo", { name: created.name });
    expect(fetched).toMatchObject({ name: created.name });

    const updated = await connect("UpdateMemo", {
      memo: { name: created.name, pinned: true },
      updateMask: "pinned",
    });
    expect(updated).toMatchObject({ name: created.name, pinned: true });

    const related = await connect("CreateMemo", {
      memo: { content: "Connect related memo" },
    });
    await connect("SetMemoRelations", {
      name: created.name,
      relations: [{ relatedMemo: { name: related.name }, type: "REFERENCE" }],
    });
    const relationList = await connect("ListMemoRelations", {
      name: created.name,
    });
    expect(relationList.relations[0]?.relatedMemo.name).toBe(related.name);
    expect(relationList.relations[0]?.type).toBe("REFERENCE");

    const incomingRelationList = await connect("ListMemoRelations", {
      name: related.name,
    });
    expect(incomingRelationList.relations).toEqual([
      expect.objectContaining({
        memo: { name: created.name, snippet: expect.any(String) },
        relatedMemo: { name: related.name, snippet: expect.any(String) },
        type: "REFERENCE",
      }),
    ]);
  });

  it("mutates comments, reactions, and shares, then deletes the memo", async () => {
    // Setup only: this test drives the sub-resource lifecycle, so the base
    // memo's own DTO shape is asserted by the unary subset test.
    const created = await connect("CreateMemo", {
      memo: { content: "Connect JSON memo" },
    });

    const comment = await connect("CreateMemoComment", {
      name: created.name,
      comment: { content: "Connect comment" },
    });
    expect(comment).toMatchObject({
      content: "Connect comment",
      parent: created.name,
    });
    const comments = await connect("ListMemoComments", {
      name: created.name,
      pageSize: 10,
    });
    expect(comments.memos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: comment.name, parent: created.name }),
      ]),
    );

    const reaction = await connect("UpsertMemoReaction", {
      name: created.name,
      reaction: { contentId: created.name, reactionType: "👍" },
    });
    expect(reaction).toMatchObject({
      contentId: created.name,
      reactionType: "👍",
    });
    const reactions = await connect("ListMemoReactions", {
      name: created.name,
    });
    expect(reactions.reactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: reaction.name }),
      ]),
    );
    await connect("DeleteMemoReaction", { name: reaction.name });

    const share = await connect("CreateMemoShare", {
      parent: created.name,
      memoShare: {},
    });
    expect(share.name).toMatch(new RegExp(`^${created.name}/shares/[^/]+$`));
    const shares = await connect("ListMemoShares", { parent: created.name });
    expect(shares.memoShares).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: share.name })]),
    );
    const shareToken = String(share.name).split("/").at(-1);
    const shared = await request("/memos.api.v1.MemoService/GetSharedMemo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shareToken }),
    });
    expect(shared.status).toBe(200);
    expect(await shared.json()).toMatchObject({ name: created.name });
    const canonicalShared = await request(
      "/memos.api.v1.MemoService/GetMemoByShare",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shareId: shareToken }),
      },
    );
    expect(canonicalShared.status).toBe(200);
    expect(await canonicalShared.json()).toMatchObject({ name: created.name });
    await connect("DeleteMemoShare", { name: share.name });

    const deleted = await connect("DeleteMemo", {
      name: created.name,
      force: true,
    });
    expect(deleted).toEqual({});
    const deletedLookup = await request("/memos.api.v1.MemoService/GetMemo", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: created.name }),
    });
    expect(deletedLookup.status).toBe(404);
  });
});
