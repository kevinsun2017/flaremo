import { ValidationError } from "@flaremo/domain";
import type { Context } from "hono";
import { z } from "zod";
import type { HonoBindings } from "./context";

export type JsonObject = Record<string, unknown>;
export type McpId = string | number | null;

const STREAMABLE_PROTOCOL_VERSIONS = ["2025-03-26", "2024-11-05"] as const;
const DEFAULT_STREAMABLE_PROTOCOL_VERSION = STREAMABLE_PROTOCOL_VERSIONS[0];

export const streamableMcpRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const streamableToolCallSchema = z.object({
  name: z.string().trim().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export function requestIdOf(value: unknown): McpId {
  if (!isJsonObject(value)) return null;
  const id = value.id;
  return typeof id === "string" || typeof id === "number" || id === null
    ? id
    : null;
}

export function negotiatedProtocolVersion(params: JsonObject | undefined) {
  const requested = params?.protocolVersion;
  return typeof requested === "string" &&
    STREAMABLE_PROTOCOL_VERSIONS.includes(
      requested as (typeof STREAMABLE_PROTOCOL_VERSIONS)[number],
    )
    ? requested
    : DEFAULT_STREAMABLE_PROTOCOL_VERSION;
}

export function normalizeStructuredContent(value: unknown): JsonObject {
  if (value === null || value === undefined) return { ok: true };
  if (isJsonObject(value)) return value;
  if (Array.isArray(value)) return { result: value };
  return { result: value };
}

export function streamableToolError(
  c: Context<HonoBindings>,
  id: McpId,
  message: string,
) {
  return c.json({
    jsonrpc: "2.0",
    id,
    result: {
      isError: true,
      content: [{ type: "text", text: message }],
      structuredContent: { error: { message } },
    },
  });
}

export function optionalString(args: JsonObject, ...names: string[]) {
  for (const name of names) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string")
      throw new ValidationError(`${name} must be a string.`);
    return value;
  }
  return undefined;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "request";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
