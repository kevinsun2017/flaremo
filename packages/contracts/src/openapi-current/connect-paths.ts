import { connectOperation, optionalReadSecurity } from "./shared";

export const connectPaths = {
  "/memos.api.v1.MemoService/CreateMemo": {
    post: connectOperation("connectCreateMemo", "Create a memo"),
  },
  "/memos.api.v1.MemoService/ListMemos": {
    post: connectOperation(
      "connectListMemos",
      "List memos",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.MemoService/GetMemo": {
    post: connectOperation(
      "connectGetMemo",
      "Get a memo",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.MemoService/UpdateMemo": {
    post: connectOperation("connectUpdateMemo", "Update a memo"),
  },
  "/memos.api.v1.MemoService/DeleteMemo": {
    post: connectOperation("connectDeleteMemo", "Delete a memo"),
  },
  "/memos.api.v1.MemoService/SetMemoAttachments": {
    post: connectOperation(
      "connectSetMemoAttachments",
      "Replace memo attachments",
    ),
  },
  "/memos.api.v1.MemoService/ListMemoAttachments": {
    post: connectOperation(
      "connectListMemoAttachments",
      "List memo attachments",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.MemoService/SetMemoRelations": {
    post: connectOperation("connectSetMemoRelations", "Replace memo relations"),
  },
  "/memos.api.v1.MemoService/ListMemoRelations": {
    post: connectOperation(
      "connectListMemoRelations",
      "List memo relations",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.MemoService/CreateMemoComment": {
    post: connectOperation("connectCreateMemoComment", "Create a memo comment"),
  },
  "/memos.api.v1.MemoService/ListMemoComments": {
    post: connectOperation(
      "connectListMemoComments",
      "List memo comments",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.MemoService/ListMemoReactions": {
    post: connectOperation(
      "connectListMemoReactions",
      "List memo reactions",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.MemoService/UpsertMemoReaction": {
    post: connectOperation(
      "connectUpsertMemoReaction",
      "Upsert a memo reaction",
    ),
  },
  "/memos.api.v1.MemoService/DeleteMemoReaction": {
    post: connectOperation(
      "connectDeleteMemoReaction",
      "Delete a memo reaction",
    ),
  },
  "/memos.api.v1.MemoService/CreateMemoShare": {
    post: connectOperation("connectCreateMemoShare", "Create a memo share"),
  },
  "/memos.api.v1.MemoService/ListMemoShares": {
    post: connectOperation("connectListMemoShares", "List memo shares"),
  },
  "/memos.api.v1.MemoService/DeleteMemoShare": {
    post: connectOperation("connectDeleteMemoShare", "Delete a memo share"),
  },
  "/memos.api.v1.MemoService/GetSharedMemo": {
    post: connectOperation("connectGetSharedMemo", "Get a shared memo", []),
  },
  "/memos.api.v1.MemoService/GetMemoByShare": {
    post: connectOperation(
      "connectGetMemoByShare",
      "Get a memo by share token",
      [],
    ),
  },
  "/memos.api.v1.MemoService/GetLinkMetadata": {
    post: connectOperation("connectGetLinkMetadata", "Get link metadata", []),
  },
  "/memos.api.v1.MemoService/BatchGetLinkMetadata": {
    post: connectOperation(
      "connectBatchGetLinkMetadata",
      "Get link metadata for multiple URLs",
      [],
    ),
  },
  "/memos.api.v1.AuthService/GetCurrentUser": {
    post: connectOperation("connectGetCurrentUser", "Get the current user"),
  },
  "/memos.api.v1.AuthService/SignIn": {
    post: connectOperation("connectSignIn", "Sign in", []),
  },
  "/memos.api.v1.AuthService/RefreshToken": {
    post: connectOperation("connectRefreshToken", "Refresh token", []),
  },
  "/memos.api.v1.AuthService/SignOut": {
    post: connectOperation("connectSignOut", "Sign out"),
  },
  "/memos.api.v1.ShortcutService/ListShortcuts": {
    post: connectOperation("connectListShortcuts", "List shortcuts"),
  },
  "/memos.api.v1.ShortcutService/GetShortcut": {
    post: connectOperation("connectGetShortcut", "Get a shortcut"),
  },
  "/memos.api.v1.ShortcutService/CreateShortcut": {
    post: connectOperation("connectCreateShortcut", "Create a shortcut"),
  },
  "/memos.api.v1.ShortcutService/UpdateShortcut": {
    post: connectOperation("connectUpdateShortcut", "Update a shortcut"),
  },
  "/memos.api.v1.ShortcutService/DeleteShortcut": {
    post: connectOperation("connectDeleteShortcut", "Delete a shortcut"),
  },
  "/memos.api.v1.AttachmentService/CreateAttachment": {
    post: connectOperation("connectCreateAttachment", "Create an attachment"),
  },
  "/memos.api.v1.AttachmentService/ListAttachments": {
    post: connectOperation("connectListAttachments", "List attachments"),
  },
  "/memos.api.v1.AttachmentService/GetAttachment": {
    post: connectOperation("connectGetAttachment", "Get an attachment"),
  },
  "/memos.api.v1.AttachmentService/UpdateAttachment": {
    post: connectOperation("connectUpdateAttachment", "Update an attachment"),
  },
  "/memos.api.v1.AttachmentService/DeleteAttachment": {
    post: connectOperation("connectDeleteAttachment", "Delete an attachment"),
  },
  "/memos.api.v1.AttachmentService/BatchDeleteAttachments": {
    post: connectOperation(
      "connectBatchDeleteAttachments",
      "Delete multiple attachments",
    ),
  },
  "/memos.api.v1.UserService/ListUsers": {
    post: connectOperation("connectListUsers", "List users"),
  },
  "/memos.api.v1.UserService/BatchGetUsers": {
    post: connectOperation("connectBatchGetUsers", "Get multiple users"),
  },
  "/memos.api.v1.UserService/GetUser": {
    post: connectOperation("connectGetUser", "Get a user"),
  },
  "/memos.api.v1.UserService/UpdateUser": {
    post: connectOperation("connectUpdateUser", "Update a user"),
  },
  "/memos.api.v1.UserService/GetUserStats": {
    post: connectOperation("connectGetUserStats", "Get user statistics"),
  },
  "/memos.api.v1.UserService/ListAllUserStats": {
    post: connectOperation("connectListAllUserStats", "List user statistics"),
  },
  "/memos.api.v1.UserService/GetUserSetting": {
    post: connectOperation("connectGetUserSetting", "Get a user setting"),
  },
  "/memos.api.v1.UserService/ListUserSettings": {
    post: connectOperation("connectListUserSettings", "List user settings"),
  },
  "/memos.api.v1.UserService/UpdateUserSetting": {
    post: connectOperation("connectUpdateUserSetting", "Update a user setting"),
  },
  "/memos.api.v1.UserService/ListLinkedIdentities": {
    post: connectOperation(
      "connectListLinkedIdentities",
      "List linked identities",
    ),
  },
  "/memos.api.v1.UserService/GetLinkedIdentity": {
    post: connectOperation("connectGetLinkedIdentity", "Get a linked identity"),
  },
  "/memos.api.v1.UserService/CreateLinkedIdentity": {
    post: connectOperation(
      "connectCreateLinkedIdentity",
      "Create a linked identity",
    ),
  },
  "/memos.api.v1.UserService/DeleteLinkedIdentity": {
    post: connectOperation(
      "connectDeleteLinkedIdentity",
      "Delete a linked identity",
    ),
  },
  "/memos.api.v1.UserService/ListPersonalAccessTokens": {
    post: connectOperation(
      "connectListPersonalAccessTokens",
      "List personal access tokens",
    ),
  },
  "/memos.api.v1.UserService/CreatePersonalAccessToken": {
    post: connectOperation(
      "connectCreatePersonalAccessToken",
      "Create a personal access token",
    ),
  },
  "/memos.api.v1.UserService/DeletePersonalAccessToken": {
    post: connectOperation(
      "connectDeletePersonalAccessToken",
      "Delete a personal access token",
    ),
  },
  "/memos.api.v1.UserService/ListUserWebhooks": {
    post: connectOperation("connectListUserWebhooks", "List user webhooks"),
  },
  "/memos.api.v1.UserService/ListUserNotifications": {
    post: connectOperation(
      "connectListUserNotifications",
      "List user notifications",
    ),
  },
  "/memos.api.v1.InstanceService/GetInstanceProfile": {
    post: connectOperation(
      "connectGetInstanceProfile",
      "Get the instance profile",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.InstanceService/GetInstanceSetting": {
    post: connectOperation(
      "connectGetInstanceSetting",
      "Get an instance setting",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.InstanceService/BatchGetInstanceSettings": {
    post: connectOperation(
      "connectBatchGetInstanceSettings",
      "Get multiple instance settings",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.InstanceService/UpdateInstanceSetting": {
    post: connectOperation(
      "connectUpdateInstanceSetting",
      "Update an instance setting",
    ),
  },
  "/memos.api.v1.InstanceService/GetInstanceStats": {
    post: connectOperation(
      "connectGetInstanceStats",
      "Get instance statistics",
    ),
  },
  "/memos.api.v1.InstanceService/TestInstanceEmailSetting": {
    post: connectOperation(
      "connectTestInstanceEmailSetting",
      "Test instance email settings",
    ),
  },
  "/memos.api.v1.IdentityProviderService/ListIdentityProviders": {
    post: connectOperation(
      "connectListIdentityProviders",
      "List identity providers",
      optionalReadSecurity,
    ),
  },
  "/memos.api.v1.AIService/Transcribe": {
    post: connectOperation("connectTranscribe", "Transcribe audio"),
  },
};
