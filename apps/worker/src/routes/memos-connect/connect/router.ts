import { currentUserToDto } from "@flaremo/memos";
import { getRequestContext } from "../../../context";
import type { BinaryTransport } from "../../../memos-protobuf";
import { connectAttachmentMethod } from "../attachment-methods";
import {
  connectAuthRefresh,
  connectAuthSignIn,
  connectAuthSignOut,
  connectAuthSignUp,
} from "../auth-methods";
import {
  connectIdentityProviderMethod,
  connectInstanceMethod,
} from "../instance-methods";
import {
  connectBatchGetLinkMetadata,
  connectGetLinkMetadata,
  createConnectMemo,
  createConnectMemoComment,
  createConnectMemoShare,
  deleteConnectMemo,
  deleteConnectMemoReaction,
  deleteConnectMemoShare,
  getConnectMemo,
  listConnectAttachments,
  listConnectMemoComments,
  listConnectMemoReactions,
  listConnectMemoShares,
  listConnectMemos,
  listConnectRelations,
  setConnectAttachments,
  setConnectRelations,
  updateConnectMemo,
  upsertConnectMemoReaction,
} from "../memo-methods";
import { type ConnectContext, getAuthUserForContext } from "../shared";
import { connectShortcutMethod } from "../shortcut-methods";
import { connectErrorForTransport, connectValue } from "../transport";
import { connectUserMethod } from "../user-methods";
import { connectPublicRoute } from "./public-routes";
import { memoService } from "./service-names";

/**
 * The dispatch table behind POST /:service/:method. Credential handling stays
 * where it always was: the caller runs the request-credential boundary before
 * this function, then the public (session-less) branches are evaluated, and
 * only afterwards is a request context resolved for the authenticated
 * branches. Every service branch refuses cleanly and an unknown method or
 * service is unimplemented, never a fall-through.
 */
export async function connectDispatch(
  c: ConnectContext,
  service: string,
  method: string,
  body: unknown,
  binaryTransport: BinaryTransport | undefined,
): Promise<Response> {
  if (service === "memos.api.v1.AuthService" && method === "SignIn") {
    return connectAuthSignIn(c, body, binaryTransport);
  }
  if (service === "memos.api.v1.AuthService" && method === "SignUp") {
    return await connectAuthSignUp(c, body, binaryTransport);
  }
  if (service === "memos.api.v1.AuthService" && method === "RefreshToken") {
    return connectAuthRefresh(c, binaryTransport);
  }
  const publicResponse = await connectPublicRoute(
    c,
    service,
    method,
    body,
    binaryTransport,
  );
  if (publicResponse) return publicResponse;
  const context = await getRequestContext(c);
  // Server-side URL fetching is a probing primitive; keep it behind auth.
  if (service === memoService && method === "GetLinkMetadata") {
    return await connectGetLinkMetadata(c, body, binaryTransport);
  }
  if (service === memoService && method === "BatchGetLinkMetadata") {
    return await connectBatchGetLinkMetadata(c, body, binaryTransport);
  }
  if (service === "memos.api.v1.AuthService" && method === "GetCurrentUser") {
    const authUser = await getAuthUserForContext(context);
    return connectValue(
      c,
      { user: currentUserToDto(context.user, authUser) },
      binaryTransport,
    );
  }
  if (service === "memos.api.v1.AuthService" && method === "SignOut") {
    return connectAuthSignOut(c, context, binaryTransport);
  }
  if (service === "memos.api.v1.AttachmentService") {
    return await connectAttachmentMethod(
      c,
      context,
      method,
      body,
      binaryTransport,
    );
  }
  if (service === "memos.api.v1.UserService") {
    return await connectUserMethod(c, context, method, body, binaryTransport);
  }
  if (service === "memos.api.v1.InstanceService") {
    return await connectInstanceMethod(
      c,
      context,
      method,
      body,
      binaryTransport,
    );
  }
  if (service === "memos.api.v1.IdentityProviderService") {
    return await connectIdentityProviderMethod(
      c,
      context,
      method,
      body,
      binaryTransport,
    );
  }
  if (service === "memos.api.v1.AIService") {
    return connectErrorForTransport(
      c,
      binaryTransport,
      "unimplemented",
      "AI transcription is not configured on FlareMo",
      501,
    );
  }
  if (service === "memos.api.v1.ShortcutService") {
    return await connectShortcutMethod(
      c,
      context,
      method,
      body,
      binaryTransport,
    );
  }
  if (service !== memoService) {
    return connectErrorForTransport(
      c,
      binaryTransport,
      "unimplemented",
      `Memos Connect service is not implemented: ${service}`,
      501,
    );
  }
  switch (method) {
    case "CreateMemo":
      return connectValue(
        c,
        await createConnectMemo(context, body),
        binaryTransport,
      );
    case "ListMemos":
      return connectValue(
        c,
        await listConnectMemos(context, body),
        binaryTransport,
      );
    case "GetMemo":
      return connectValue(
        c,
        await getConnectMemo(context, body),
        binaryTransport,
      );
    case "UpdateMemo":
      return connectValue(
        c,
        await updateConnectMemo(context, body),
        binaryTransport,
      );
    case "DeleteMemo":
      await deleteConnectMemo(context, c.env, body);
      return connectValue(c, {}, binaryTransport);
    case "SetMemoAttachments":
      await setConnectAttachments(context, body);
      return connectValue(c, {}, binaryTransport);
    case "ListMemoAttachments":
      return connectValue(
        c,
        await listConnectAttachments(context, body),
        binaryTransport,
      );
    case "SetMemoRelations":
      await setConnectRelations(context, body);
      return connectValue(c, {}, binaryTransport);
    case "ListMemoRelations":
      return connectValue(
        c,
        await listConnectRelations(context, body),
        binaryTransport,
      );
    case "CreateMemoComment":
      return connectValue(
        c,
        await createConnectMemoComment(context, body),
        binaryTransport,
      );
    case "ListMemoComments":
      return connectValue(
        c,
        await listConnectMemoComments(context, body),
        binaryTransport,
      );
    case "ListMemoReactions":
      return connectValue(
        c,
        await listConnectMemoReactions(context, body),
        binaryTransport,
      );
    case "UpsertMemoReaction":
      return connectValue(
        c,
        await upsertConnectMemoReaction(context, body),
        binaryTransport,
      );
    case "DeleteMemoReaction":
      await deleteConnectMemoReaction(context, body);
      return connectValue(c, {}, binaryTransport);
    case "CreateMemoShare":
      return connectValue(
        c,
        await createConnectMemoShare(context, body),
        binaryTransport,
      );
    case "ListMemoShares":
      return connectValue(
        c,
        await listConnectMemoShares(context, body),
        binaryTransport,
      );
    case "DeleteMemoShare":
      await deleteConnectMemoShare(context, body);
      return connectValue(c, {}, binaryTransport);
    default:
      return connectErrorForTransport(
        c,
        binaryTransport,
        "unimplemented",
        `Memos Connect method is not implemented: ${method}`,
        501,
      );
  }
}
