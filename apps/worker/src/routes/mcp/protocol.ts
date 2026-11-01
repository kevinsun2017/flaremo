import { DomainError } from "@flaremo/domain";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { HonoBindings } from "../../context";
import {
  formatZodError,
  type McpId,
  normalizeStructuredContent,
} from "../../mcp-protocol";

/*
 * This app is intentionally separate from mcpApi above. The latter is the
 * original /api/v1/mcp JSON-RPC subset and is kept for existing clients. The
 * app below is the stateless Streamable HTTP surface that the main Worker can
 * mount at /mcp without changing the legacy route.
 */
export const mcpStreamableApi = new Hono<HonoBindings>();

export const currentMemoBodySchema = {
  type: "object",
  required: ["content"],
  properties: {
    name: { type: "string", description: "Memos resource name." },
    content: { type: "string" },
    visibility: {
      type: "string",
      enum: [
        "VISIBILITY_UNSPECIFIED",
        "PRIVATE",
        "PROTECTED",
        "PUBLIC",
        "private",
        "protected",
        "public",
      ],
    },
    state: {
      type: "string",
      enum: [
        "STATE_UNSPECIFIED",
        "NORMAL",
        "ARCHIVED",
        "TRASHED",
        "DELETED",
        "normal",
        "archived",
        "trashed",
        "deleted",
      ],
    },
    pinned: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
    payload: { type: "object", additionalProperties: true },
    property: { type: "object", additionalProperties: true },
    location: {},
    source: { type: "string" },
  },
  additionalProperties: true,
};

export const resourceNameInput = {
  type: "string",
  minLength: 1,
  description: "A Memos resource name, for example memos/<id>.",
};

export function streamableProtocolError(
  c: Context<HonoBindings>,
  id: McpId,
  code: number,
  message: string,
) {
  return c.json({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

export function streamableToolSuccess(
  c: Context<HonoBindings>,
  id: McpId,
  value: unknown,
) {
  const structuredContent = normalizeStructuredContent(value);
  return c.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(structuredContent),
        },
      ],
      structuredContent,
    },
  });
}

export function readableError(error: unknown) {
  if (error instanceof z.ZodError) return formatZodError(error);
  // Only domain-level errors carry a caller-facing message. Anything else
  // (D1 failures, TypeErrors, …) is logged server-side and stays generic.
  if (error instanceof DomainError) return error.message;
  console.error(
    JSON.stringify({
      level: "error",
      message: "Unhandled MCP tool error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return "Tool call failed.";
}
