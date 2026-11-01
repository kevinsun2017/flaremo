import type { JsonObject } from "../../mcp-protocol";
import { currentMemoBodySchema, resourceNameInput } from "./protocol";

export const streamableTools: Array<{
  name: string;
  description: string;
  inputSchema: JsonObject;
}> = [
  {
    name: "memo_list_memos",
    description:
      "List the current user's memos. Supports the FlareMo-backed subset of the current Memos list contract.",
    inputSchema: {
      type: "object",
      properties: {
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageToken: { type: "string" },
        state: {
          type: "string",
          enum: [
            "STATE_UNSPECIFIED",
            "NORMAL",
            "ARCHIVED",
            "TRASHED",
            "DELETED",
          ],
        },
        orderBy: {
          type: "string",
          description:
            "One supported ordering such as create_time desc or update_time asc.",
        },
        filter: {
          type: "string",
          description:
            "A Memos CEL expression evaluated against the memo resource.",
        },
        showDeleted: { type: "boolean" },
        q: { type: "string" },
        tag: { type: "string" },
        page_size: { type: "integer", minimum: 1, maximum: 100 },
        page_token: { type: "string" },
        include_deleted: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_create_memo",
    description:
      "Create a memo for the authenticated FlareMo user. The current Memos body shape is supported.",
    inputSchema: {
      type: "object",
      properties: {
        body: currentMemoBodySchema,
        content: { type: "string" },
        visibility: currentMemoBodySchema.properties.visibility,
        state: currentMemoBodySchema.properties.state,
        pinned: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        payload: { type: "object", additionalProperties: true },
        property: { type: "object", additionalProperties: true },
        location: {},
        source: { type: "string" },
        memoId: { type: "string" },
        memo_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_get_memo",
    description: "Get one memo by its Memos resource name.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_update_memo",
    description:
      "Update a memo using the current Memos body/updateMask shape or the equivalent direct fields.",
    inputSchema: {
      type: "object",
      properties: {
        memo: resourceNameInput,
        name: resourceNameInput,
        body: currentMemoBodySchema,
        updateMask: { type: "string" },
        update_mask: { type: "string" },
        content: { type: "string" },
        visibility: currentMemoBodySchema.properties.visibility,
        state: currentMemoBodySchema.properties.state,
        pinned: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        payload: { type: "object", additionalProperties: true },
        property: { type: "object", additionalProperties: true },
        location: {},
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_delete_memo",
    description:
      "Move a memo to trash, or permanently delete it when force is explicitly true.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        force: { type: "boolean" },
        hard: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_list_memo_attachments",
    description: "List ready attachments bound to one memo.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageToken: { type: "string" },
        page_size: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_set_memo_attachments",
    description:
      "Replace the attachment set of a memo. Each attachment is a resource name or an object containing name.",
    inputSchema: {
      type: "object",
      required: ["name", "attachments"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        attachments: {
          type: "array",
          maxItems: 100,
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                required: ["name"],
                properties: { name: resourceNameInput },
                additionalProperties: true,
              },
            ],
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_list_memo_relations",
    description: "List relations owned by one memo.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageToken: { type: "string" },
        page_size: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_set_memo_relations",
    description:
      "Replace all relations owned by one memo using current Memos relation objects or the FlareMo-compatible shape.",
    inputSchema: {
      type: "object",
      required: ["name", "relations"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        relations: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            required: ["relatedMemo", "type"],
            properties: {
              memo: { type: "object", additionalProperties: true },
              relatedMemo: { type: "object", additionalProperties: true },
              related_memo: resourceNameInput,
              type: {
                type: "string",
                enum: [
                  "TYPE_UNSPECIFIED",
                  "REFERENCE",
                  "COMMENT",
                  "reference",
                  "comment",
                ],
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_list_memo_comments",
    description: "List comments attached to one memo.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageToken: { type: "string" },
        orderBy: { type: "string", example: "create_time desc" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_create_memo_comment",
    description: "Create a comment memo attached to one parent memo.",
    inputSchema: {
      type: "object",
      required: ["name", "content"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        body: { type: "object", additionalProperties: true },
        comment: { type: "object", additionalProperties: true },
        content: { type: "string" },
        visibility: { type: "string" },
        payload: { type: "object", additionalProperties: true },
        source: { type: "string" },
        commentId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_list_memo_reactions",
    description: "List reactions attached to one memo.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageToken: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_upsert_memo_reaction",
    description: "Create or idempotently upsert the current user's reaction.",
    inputSchema: {
      type: "object",
      required: ["name", "reactionType"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        reaction: { type: "object", additionalProperties: true },
        contentId: { type: "string" },
        reactionType: { type: "string" },
        reaction_type: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memo_delete_memo_reaction",
    description: "Delete one reaction owned by the current user.",
    inputSchema: {
      type: "object",
      required: ["name", "reaction"],
      properties: {
        name: resourceNameInput,
        memo: resourceNameInput,
        reaction: resourceNameInput,
      },
      additionalProperties: false,
    },
  },
  {
    name: "shortcut_list_shortcuts",
    description: "List shortcuts for the authenticated current user.",
    inputSchema: {
      type: "object",
      properties: { parent: resourceNameInput, user: resourceNameInput },
      additionalProperties: false,
    },
  },
  {
    name: "shortcut_create_shortcut",
    description: "Create or validate a shortcut for the current user.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        filter: { type: "string" },
        shortcut: { type: "object", additionalProperties: true },
        validateOnly: { type: "boolean" },
        validate_only: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "shortcut_get_shortcut",
    description: "Get one shortcut by its resource name.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: resourceNameInput },
      additionalProperties: false,
    },
  },
  {
    name: "shortcut_update_shortcut",
    description: "Update a shortcut using an optional updateMask.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: resourceNameInput,
        shortcut: { type: "object", additionalProperties: true },
        title: { type: "string" },
        filter: { type: "string" },
        updateMask: { type: "string" },
        update_mask: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "shortcut_delete_shortcut",
    description: "Delete one shortcut owned by the current user.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: resourceNameInput },
      additionalProperties: false,
    },
  },
  {
    name: "attachment_list_attachments",
    description:
      "List ready attachments. FlareMo supports pageSize and optional memo filtering; unsupported current-Memos filters return a tool error.",
    inputSchema: {
      type: "object",
      properties: {
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
        pageToken: { type: "string" },
        filter: { type: "string" },
        orderBy: { type: "string" },
        memo: resourceNameInput,
        page_size: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "attachment_get_attachment",
    description: "Get one attachment by its Memos resource name.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        attachment: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "attachment_delete_attachment",
    description: "Delete one attachment and its R2 object.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        attachment: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "auth_get_current_user",
    description:
      "Return the authenticated FlareMo user's current-user resource.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
