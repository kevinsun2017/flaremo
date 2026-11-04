import { agentChatMessages, agentConversations } from "@flaremo/db";
import { getSemanticSearchMemos, semanticSearchMemos } from "@flaremo/domain";
import { asc, desc, eq, and } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { getRequestContext, type HonoBindings } from "../../context";
import { createEmbeddingProvider, createVectorIndex, memoSearchNamespaces } from "../../embedding";
import { jsonError } from "../../http";
import { zValidator } from "../../validated";
import { chatWithMagpie } from "../llm";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  retry: z.boolean().optional(),
});

export function registerAgentRoutes(app: Hono<HonoBindings>) {
  // List conversations (newest first).
  app.get("/agent/conversations", async (c) => {
    try {
      const { db, user } = await getRequestContext(c);
      const rows = await db
        .select()
        .from(agentConversations)
        .where(eq(agentConversations.userId, user.id))
        .orderBy(desc(agentConversations.updatedAt))
        .limit(100);
      return c.json({ conversations: rows });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // Create a conversation.
  app.post(
    "/agent/conversations",
    zValidator("json", createConversationSchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const { title } = c.req.valid("json");
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await db.insert(agentConversations).values({
          id,
          userId: user.id,
          title: title ?? "新对话",
          createdAt: now,
          updatedAt: now,
        });
        return c.json({ conversation: { id, userId: user.id, title: title ?? "新对话", createdAt: now, updatedAt: now } }, 201);
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  // List a conversation's messages (oldest first).
  app.get("/agent/conversations/:id/messages", async (c) => {
    try {
      const { db, user } = await getRequestContext(c);
      const convId = c.req.param("id");
      const rows = await db
        .select()
        .from(agentChatMessages)
        .where(
          and(
            eq(agentChatMessages.conversationId, convId),
            eq(agentChatMessages.userId, user.id),
          ),
        )
        .orderBy(asc(agentChatMessages.createdAt));
      return c.json({ messages: rows });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // Chat: append a user message, run the LLM, store + return the assistant reply.
  app.post(
    "/agent/conversations/:id/messages",
    zValidator("json", chatMessageSchema),
    async (c) => {
      try {
      const { db, user } = await getRequestContext(c);
      const convId = c.req.param("id");

        const { content, retry } = c.req.valid("json");

        // Confirm the conversation belongs to the caller (owner check).
        const conv = await db
          .select()
          .from(agentConversations)
          .where(
            and(
              eq(agentConversations.id, convId),
              eq(agentConversations.userId, user.id),
            ),
          )
          .limit(1);
        if (conv.length === 0) {
          return c.json({ error: { message: "conversation not found" } }, 404);
        }

        // Append the user message (skipped on LLM retry to avoid duplicates).
        if (!retry) {
          const now = new Date().toISOString();
          const userMsgId = crypto.randomUUID();
          await db.insert(agentChatMessages).values({
            id: userMsgId,
            conversationId: convId,
            userId: user.id,
            role: "user",
            content,
            createdAt: now,
          });
        }

        const runBackground = async () => {
          try {
            const history = await db
              .select()
              .from(agentChatMessages)
              .where(
                and(
                  eq(agentChatMessages.conversationId, convId),
                  eq(agentChatMessages.userId, user.id),
                ),
              )
              .orderBy(asc(agentChatMessages.createdAt));
            const llmMessages = history.map((m) => ({
              role: m.role,
              content: m.content,
            }));

            let ragContext = "";
            const provider = createEmbeddingProvider(c.env);
            const index = createVectorIndex(c.env);
            if (provider && index) {
              try {
                const hits = await semanticSearchMemos(
                  db,
                  user,
                  {
                    provider,
                    index,
                    namespaces: memoSearchNamespaces(c.env, user, undefined),
                  },
                  content,
                  5,
                );
                if (hits.length > 0) {
                  const memos = await getSemanticSearchMemos(
                    db,
                    user,
                    hits.map((hit) => hit.id),
                  );
                  ragContext =
                    "\n\n以下是与你问题相关的记忆笔记（供回答引用，只选相关的，不要编造无关内容）：\n" +
                    memos
                      .map((memo, i) => `[来源${i + 1}] ${memo.content.slice(0, 500)}`)
                      .join("\n\n");
                }
              } catch (ragErr) {
                console.error("RAG failed:", ragErr);
              }
            }

            const systemPrompt = `你是 FlareMo 里的 AI 助手，基于用户的记忆与笔记内容简洁、直接、具体地用中文回答。${ragContext}`;
            try {
              const reply = await chatWithMagpie(c.env, [
                { role: "system", content: systemPrompt },
                ...llmMessages,
              ]);
              await db.insert(agentChatMessages).values({
                id: crypto.randomUUID(),
                conversationId: convId,
                userId: user.id,
                role: "assistant",
                content: reply,
                createdAt: new Date().toISOString(),
              });
            } catch (llmErr) {
              console.error("LLM failed:", llmErr);
            }
          } catch (err) {
            console.error("agent background failed:", err);
          }
        };

        try {
          (c as any).executionCtx?.waitUntil(runBackground());
        } catch {
          // Fallback for environments without executionCtx: run inline (blocks).
          await runBackground();
        }

        return c.json({ status: "accepted" }, 202);
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );
}
