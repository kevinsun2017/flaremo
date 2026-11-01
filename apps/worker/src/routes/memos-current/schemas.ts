import { z } from "zod";
export const currentMemoBodySchema = z
  .object({
    memo: z.record(z.string(), z.unknown()).optional(),
    memoId: z.string().optional(),
    updateMask: z.string().optional(),
    name: z.string().optional(),
    state: z.string().optional(),
    creator: z.string().optional(),
    createTime: z.string().optional(),
    updateTime: z.string().optional(),
    content: z.string().optional(),
    visibility: z.string().optional(),
    pinned: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    property: z.record(z.string(), z.unknown()).optional(),
    location: z.record(z.string(), z.unknown()).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    relations: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

export const currentSigninSchema = z.object({
  passwordCredentials: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
});

export const currentSignupSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(320).optional(),
});

export const currentRelationBodySchema = z.object({
  name: z.string().optional(),
  relations: z.array(
    z.object({
      memo: z.record(z.string(), z.unknown()).optional(),
      relatedMemo: z.record(z.string(), z.unknown()).optional(),
      type: z.string().optional(),
      related_memo: z.string().optional(),
    }),
  ),
});

export const currentShareBodySchema = z
  .object({
    memoShare: z.record(z.string(), z.unknown()).optional(),
    name: z.string().optional(),
    createTime: z.string().optional(),
    expireTime: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .passthrough();

export const currentAttachmentBodySchema = z
  .object({
    attachment: z.record(z.string(), z.unknown()).optional(),
    attachmentId: z.string().optional(),
    name: z.string().optional(),
    createTime: z.string().optional(),
    filename: z.string().trim().min(1).max(512).optional(),
    content: z.string().optional(),
    externalLink: z.string().url().optional(),
    type: z.string().trim().min(1).max(255).optional(),
    memo: z.string().nullable().optional(),
  })
  .passthrough();

export const currentPatBodySchema = z.object({
  description: z.string().trim().min(1).max(32).optional(),
  expiresInDays: z.number().int().min(0).max(365).optional(),
});

export const currentAttachmentPatchBodySchema = z
  .object({
    attachment: z.record(z.string(), z.unknown()).optional(),
    updateMask: z.string().optional(),
    name: z.string().optional(),
    memo: z.string().nullable().optional(),
  })
  .passthrough();
