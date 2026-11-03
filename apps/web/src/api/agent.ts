import { apiRequest } from "./client";
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

/**
 * Append a user message and run the LLM. Returns the assistant reply plus the
 * memo ids retrieved as grounding sources for this turn (may be empty).
 */
export async function sendMessage(conversationId: string, content: string) {
  return apiRequest<{ message: AgentChatMessage; sources: string[] }>(
    `/api/app/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
}