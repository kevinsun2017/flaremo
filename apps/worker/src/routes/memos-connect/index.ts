import { Hono } from "hono";
import {
  assertRequestCredentialBoundary,
  type HonoBindings,
} from "../../context";
import {
  decodeConnectRequestBody,
  selectConnectTransport,
} from "./connect/binary-body";
import { connectDispatch } from "./connect/router";
import { connectErrorFrom } from "./transport";

/**
 * Connect's JSON protocol is HTTP unary RPC: the request and response body are
 * the protobuf-JSON message itself.  It is separate from the REST adapter so
 * Connect clients can use the canonical service/method paths without relying
 * on a vendor header or a REST-shaped URL.
 *
 * The core MemoService supports Connect JSON plus protobuf unary frames for
 * Connect, gRPC, and gRPC-Web. Service coverage remains explicit below so an
 * unimplemented upstream RPC cannot be mistaken for a generic transport win.
 *
 * This module is the assembly point only: the media-type gate and body decoder
 * live in ./connect/binary-body, the public branch and the dispatch table in
 * ./connect/public-routes and ./connect/router. The credential boundary stays
 * here, ahead of the dispatch, so its position cannot drift.
 */
export const memosConnectApi = new Hono<HonoBindings>();

memosConnectApi.post("/:service/:method", async (c) => {
  const transport = selectConnectTransport(c);
  if (transport.unsupportedMediaType) return transport.unsupportedMediaType;

  const service = c.req.param("service") ?? "";
  const decoded = await decodeConnectRequestBody(
    c,
    service,
    c.req.param("method") ?? "",
    transport.binaryTransport,
  );
  if ("errorResponse" in decoded) return decoded.errorResponse;

  try {
    assertRequestCredentialBoundary(c);
    return await connectDispatch(
      c,
      service,
      decoded.method,
      decoded.body,
      transport.binaryTransport,
    );
  } catch (error) {
    if (transport.binaryTransport) {
      return connectErrorFrom(c, error, transport.binaryTransport);
    }
    return connectErrorFrom(c, error);
  }
});
