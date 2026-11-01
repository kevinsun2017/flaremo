import { Hono } from "hono";
import type { HonoBindings } from "../../context";
import { registerMemosRoutes } from "./memos";
import { registerTransferRoutes } from "./transfer";

/**
 * Legacy Memos REST surface (snake_case wire). Requests on `/api/v1` that the
 * current-wire and Connect apps decline fall through `next()` into these
 * handlers, so the assembly order below is part of the compatibility contract:
 * each group is registered in the order the single-file router declared it.
 */
export const memosApi = new Hono<HonoBindings>();

registerMemosRoutes(memosApi);
registerTransferRoutes(memosApi);
