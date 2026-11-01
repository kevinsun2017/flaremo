import { FLAREMO_API_VERSION } from "../openapi";
import { components, legacyWire } from "./components";
import { connectPaths } from "./connect-paths";
import { mcpPaths, restPaths } from "./rest-paths";

export function createCurrentOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "FlareMo current Memos-compatible API",
      version: FLAREMO_API_VERSION,
      description:
        "The default /api/v1 wire format is the current Memos camelCase/protobuf-JSON subset. Better Auth remains the identity source; the Memos-compatible signin facade issues an HS256 native Memos access JWT and a rotating memos_refresh HttpOnly cookie. Existing Better Auth session bearers and memos_pat_ PATs remain accepted. This is not a claim of complete Memos Server, protobuf Connect, native gRPC, or third-party-client parity. The legacy FlareMo snake_case wire is available only with X-FlareMo-Wire: legacy or application/vnd.flaremo.legacy+json.",
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Auth" },
      { name: "Memos" },
      { name: "Attachments" },
      { name: "Relations" },
      { name: "Social" },
      { name: "Realtime" },
      { name: "Connect" },
      { name: "Shares" },
      { name: "Users" },
      { name: "MCP" },
    ],
    paths: {
      ...restPaths,
      ...connectPaths,
      ...mcpPaths,
    },
    components,
    "x-flaremo-legacy-wire": legacyWire,
  };
}
