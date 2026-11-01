import {
  attachment,
  currentMemo,
  currentUser,
  error,
  memoReaction,
  shortcut,
} from "./shared";

export const components = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat:
        "Memos native HS256 JWT, memos_pat_ PAT, or legacy Better Auth session bearer",
    },
    cookieAuth: {
      type: "apiKey",
      in: "cookie",
      name: "flaremo.session_token",
    },
    memosRefreshCookie: {
      type: "apiKey",
      in: "cookie",
      name: "memos_refresh",
      description:
        "HttpOnly rotating Memos refresh JWT cookie. It is set by signin and consumed by refresh; the refresh token is never returned in JSON.",
    },
  },
  schemas: {
    Memo: currentMemo,
    MemoProperty: {
      type: "object",
      properties: {
        hasLink: { type: "boolean" },
        hasTaskList: { type: "boolean" },
        hasCode: { type: "boolean" },
        hasIncompleteTasks: { type: "boolean" },
        title: { type: "string" },
      },
    },
    Location: {
      type: "object",
      properties: {
        placeholder: { type: "string" },
        latitude: { type: "number" },
        longitude: { type: "number" },
      },
    },
    Attachment: attachment,
    MemoRelation: {
      type: "object",
      properties: {
        memo: {
          type: "object",
          properties: {
            name: { type: "string" },
            snippet: { type: "string" },
          },
        },
        relatedMemo: {
          type: "object",
          properties: {
            name: { type: "string" },
            snippet: { type: "string" },
          },
        },
        type: {
          type: "string",
          enum: ["TYPE_UNSPECIFIED", "REFERENCE", "COMMENT"],
        },
      },
    },
    MemoReaction: memoReaction,
    Shortcut: shortcut,
    MemoShare: {
      type: "object",
      properties: {
        name: { type: "string" },
        createTime: { type: "string", format: "date-time" },
        expireTime: { type: "string", format: "date-time", nullable: true },
      },
    },
    User: currentUser,
    PersonalAccessToken: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        expiresAt: { type: "string", format: "date-time", nullable: true },
        lastUsedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    Error: error,
  },
};

export const legacyWire = {
  header: "X-FlareMo-Wire: legacy",
  accept: "application/vnd.flaremo.legacy+json",
  document: "/openapi.json",
};
