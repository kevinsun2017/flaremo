// The MCP surface is split across ./mcp/*. Importing ./mcp/index registers the
// Streamable HTTP handler on mcpStreamableApi, so this barrel preserves both
// the exports and the module side effects of the original single file.

export { mcpStreamableApi } from "./mcp/index";
export { mcpApi } from "./mcp/legacy-jsonrpc";
