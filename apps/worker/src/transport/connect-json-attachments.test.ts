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

const { connect, connectService, request } = createMemosTransportHarness(
  () => ({
    env,
    accessToken,
  }),
);

describe("Connect JSON attachments and reads", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createMemosTransportRuntime());
    ({ accessToken } = await signInMemosNative(env));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("uploads, paginates, and filters attachments over Connect JSON", async () => {
    // Setup only: the base memo's DTO shape is asserted by the unary subset
    // test, so this test starts from a bare create.
    const created = await connect("CreateMemo", {
      memo: { content: "Connect JSON memo" },
    });

    const attachment = await request("/api/v1/attachments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        attachment: {
          filename: "connect.txt",
          content: "Y29ubmVjdA==",
          type: "text/plain",
          memo: created.name,
        },
      }),
    });
    expect(attachment.status).toBe(200);
    const attachmentBody = (await attachment.json()) as { name: string };
    await connect("SetMemoAttachments", {
      name: created.name,
      attachments: [{ name: attachmentBody.name }],
    });
    const attachmentList = await connect("ListMemoAttachments", {
      name: created.name,
    });
    expect(attachmentList.attachments).toEqual([
      expect.objectContaining({ name: attachmentBody.name }),
    ]);

    const secondAttachment = await request("/api/v1/attachments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        attachment: {
          filename: "second-connect.txt",
          content: "c2Vjb25k",
          type: "text/plain",
          memo: created.name,
        },
      }),
    });
    expect(secondAttachment.status).toBe(200);
    const secondAttachmentBody = (await secondAttachment.json()) as {
      name: string;
    };

    const firstAttachmentPage = await connectService(
      "AttachmentService",
      "ListAttachments",
      { pageSize: 1, orderBy: "filename asc" },
    );
    expect(firstAttachmentPage.attachments).toHaveLength(1);
    expect(firstAttachmentPage.totalSize).toBeGreaterThanOrEqual(2);
    expect(firstAttachmentPage.nextPageToken).toEqual(expect.any(String));

    const secondAttachmentPage = await connectService(
      "AttachmentService",
      "ListAttachments",
      {
        pageSize: 1,
        orderBy: "filename asc",
        pageToken: firstAttachmentPage.nextPageToken,
      },
    );
    expect(secondAttachmentPage.attachments).toHaveLength(1);
    expect(secondAttachmentPage.nextPageToken).toBeUndefined();
    expect(secondAttachmentPage.attachments[0]?.name).toBe(
      secondAttachmentBody.name,
    );

    const mismatchedAttachmentToken = await request(
      "/memos.api.v1.AttachmentService/ListAttachments",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          pageSize: 1,
          orderBy: "create_time desc",
          pageToken: firstAttachmentPage.nextPageToken,
        }),
      },
    );
    expect(mismatchedAttachmentToken.status).toBe(400);

    const filteredAttachments = await connectService(
      "AttachmentService",
      "ListAttachments",
      { filter: 'filename.contains("second-connect")' },
    );
    expect(filteredAttachments.totalSize).toBe(1);
    expect(filteredAttachments.attachments).toEqual([
      expect.objectContaining({ name: secondAttachmentBody.name }),
    ]);

    const filteredAttachmentPage = await connectService(
      "AttachmentService",
      "ListAttachments",
      {
        pageSize: 1,
        orderBy: "filename asc",
        filter:
          'mime_type in ["text/plain"] && create_time < now + duration("1h")',
      },
    );
    expect(filteredAttachmentPage.totalSize).toBe(2);
    expect(filteredAttachmentPage.attachments).toHaveLength(1);
    expect(filteredAttachmentPage.nextPageToken).toEqual(expect.any(String));
    const filteredAttachmentPageTwo = await connectService(
      "AttachmentService",
      "ListAttachments",
      {
        pageSize: 1,
        orderBy: "filename asc",
        filter:
          'mime_type in ["text/plain"] && create_time < now + duration("1h")',
        pageToken: filteredAttachmentPage.nextPageToken,
      },
    );
    expect(filteredAttachmentPageTwo.totalSize).toBe(2);
    expect(filteredAttachmentPageTwo.attachments).toHaveLength(1);
    expect(filteredAttachmentPageTwo.nextPageToken).toBeUndefined();

    const memoFilteredAttachments = await connectService(
      "AttachmentService",
      "ListAttachments",
      { filter: `memo_id == "${created.name}"` },
    );
    expect(memoFilteredAttachments.totalSize).toBe(2);
    expect(memoFilteredAttachments.attachments).toHaveLength(2);
  });

  it("reads instance settings, users, identity providers, and attachment pages", async () => {
    // Setup only: one attached memo, so the attachment page has a row to
    // return. Its own DTO assertions live in the tests above.
    const created = await connect("CreateMemo", {
      memo: { content: "Connect JSON memo" },
    });
    const attachment = await request("/api/v1/attachments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        attachment: {
          filename: "connect.txt",
          content: "Y29ubmVjdA==",
          type: "text/plain",
          memo: created.name,
        },
      }),
    });
    const attachmentBody = (await attachment.json()) as { name: string };

    const profile = await connectService(
      "InstanceService",
      "GetInstanceProfile",
      {},
    );
    expect(profile).toMatchObject({
      demo: false,
      needsSetup: false,
      admin: { name: "users/owner" },
    });
    const instanceSettings = await connectService(
      "InstanceService",
      "BatchGetInstanceSettings",
      {
        names: ["instance/settings/GENERAL", "instance/settings/MEMO_RELATED"],
      },
    );
    expect(instanceSettings.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "instance/settings/GENERAL",
          generalSetting: expect.objectContaining({
            disallowUserRegistration: true,
          }),
        }),
      ]),
    );

    const listedUsers = await connectService("UserService", "ListUsers", {});
    expect(listedUsers).toMatchObject({
      users: [expect.objectContaining({ name: "users/owner" })],
      totalSize: 1,
    });
    const userSettings = await connectService(
      "UserService",
      "ListUserSettings",
      {
        parent: "users/owner",
      },
    );
    expect(userSettings.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "users/owner/settings/GENERAL" }),
      ]),
    );
    const providers = await connectService(
      "IdentityProviderService",
      "ListIdentityProviders",
      {},
    );
    expect(providers).toEqual({ identityProviders: [] });

    const connectAttachments = await connectService(
      "AttachmentService",
      "ListAttachments",
      { pageSize: 10 },
    );
    expect(connectAttachments.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: attachmentBody.name }),
      ]),
    );
  });
});
