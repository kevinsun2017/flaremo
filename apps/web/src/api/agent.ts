import { apiRequest } from "./client";
import type { AgentSkillId } from "@flaremo/contracts";
import type { AgentChatMessage, AgentConversation } from "./types";

/** Conversation list, newest first. */
export async function listConversations() {
  return apiRequest<{ conversations: AgentConversation[] }>(
    "/api/app/agent/conversations",
  );
}

export async function createConversation(title?: string) {
  return apiRequest<{ conversation: AgentConversation }>(
    "/api/app/agent/conversations",
    { method: "POST", body: JSON.stringify(title ? { title } : {}) },
  );
}

/** A conversation's messages, oldest first. */
export async function listMessages(conversationId: string) {
  return apiRequest<{ messages: AgentChatMessage[] }>(
    `/api/app/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
}

export async function sendMessage(
  conversationId: string,
  content: string,
  options: { retry?: boolean; skill?: AgentSkillId } = {},
) {
  return apiRequest<{ status: string }>(
    `/api/app/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify({ content, ...options }) },
  );
}