import { getOptionalRequestContext } from "../../../context";
import type { BinaryTransport } from "../../../memos-protobuf";
import { connectInstanceMethod } from "../instance-methods";
import {
  connectGetSharedMemo,
  connectPublicMemoRead,
  isPublicMemoReadMethod,
} from "../memo-methods";
import {
  type ConnectContext,
  type ConnectRequestContext,
  getPublicInstanceContext,
} from "../shared";
import { connectValue } from "../transport";
import { memoService } from "./service-names";

/**
 * The Connect branches that must be evaluated before a request context is
 * required: shared-memo reads, the instance's read-only RPCs, the empty
 * identity-provider list. The router calls this ahead of `getRequestContext`,
 * so anonymous callers keep reaching exactly these methods and nothing else.
 * Returns undefined when none of them matched, never a partial response.
 */
export async function connectPublicRoute(
  c: ConnectContext,
  service: string,
  method: string,
  body: unknown,
  binaryTransport: BinaryTransport | undefined,
): Promise<Response | undefined> {
  if (service === memoService && method === "GetMemoByShare") {
    return await connectGetSharedMemo(c, body, binaryTransport);
  }
  if (service === memoService && isPublicMemoReadMethod(method)) {
    return await connectPublicMemoRead(
      c,
      await getOptionalRequestContext(c),
      method,
      body,
      binaryTransport,
    );
  }
  if (
    service === "memos.api.v1.IdentityProviderService" &&
    method === "ListIdentityProviders"
  ) {
    return connectValue(c, { identityProviders: [] }, binaryTransport);
  }
  if (
    service === "memos.api.v1.InstanceService" &&
    [
      "GetInstanceProfile",
      "GetInstanceSetting",
      "BatchGetInstanceSettings",
    ].includes(method)
  ) {
    const optionalContext = await getOptionalRequestContext(c);
    return await connectInstanceMethod(
      c,
      optionalContext.user
        ? (optionalContext as ConnectRequestContext)
        : await getPublicInstanceContext(c),
      method,
      body,
      binaryTransport,
    );
  }
  return undefined;
}
