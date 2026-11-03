import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/**
 * Agent conversation persistence (P1 — flomo-style chat skeleton).
 *
 * Minimal two-table design following the project's D1 conventions. Kept
 * deliberately small: a conversation is a title + ordered message history.
 * The memory ledger (memos payload.memory) is deliberately NOT stored here —
 * conversations are transient, the ledger is the durable Agent memory.
 */
export const agentConversations = sqliteTable("agent_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("新对话"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentChatMessages = sqliteTable("agent_chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => agentConversations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});