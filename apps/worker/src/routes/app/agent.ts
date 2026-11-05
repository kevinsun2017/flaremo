import { agentChatMessages, agentConversations } from "@flaremo/db";
import { getSemanticSearchMemos, getRandomMemo, listDailyReviewMemos, semanticSearchMemos } from "@flaremo/domain";
import { asc, desc, eq, and } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { getRequestContext, type HonoBindings } from "../../context";
import { createEmbeddingProvider, createVectorIndex, memoSearchNamespaces } from "../../embedding";
import { AGENT_SKILLS, isAgentSkillId } from "@flaremo/contracts";
import { jsonError } from "../../http";
import { zValidator } from "../../validated";
import { chatWithAgentModel } from "../llm";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  retry: z.boolean().optional(),
  skill: z.string().trim().max(64).optional(),
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

        const { content, retry, skill: skillRaw } = c.req.valid("json");
        if (skillRaw !== undefined && !isAgentSkillId(skillRaw)) {
          return c.json({ error: { message: "unknown agent skill" } }, 400);
        }
        // 技能指令注入 system prompt；RAG 检索词单独给，避免长指令污染召回。
        const skill = isAgentSkillId(skillRaw) ? AGENT_SKILLS[skillRaw] : undefined;

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
          // 用首条消息截断作为会话标题，避免全部显示“新对话”
          if (conv[0]?.title === "新对话" || conv[0]?.title === "新会话") {
            await db
              .update(agentConversations)
              .set({ title: content.slice(0, 24) || "新对话", updatedAt: now })
              .where(eq(agentConversations.id, convId));
          }
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
            const contextMemos: { content: string }[] = [];
            const provider = createEmbeddingProvider(c.env);
            const index = createVectorIndex(c.env);
            const mode = skill?.retrieval ?? "semantic";
            try {
              if (mode === "same-day-history") {
                // 那年今日：复用每日回顾的取数（按 month-day 匹配往年）
                const today = new Date();
                const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                for (let back = 1; back <= 5 && contextMemos.length < 5; back += 1) {
                  const rows = await listDailyReviewMemos(db, user, {
                    date: `${today.getFullYear() - back}-${monthDay}`,
                  });
                  for (const row of rows) if (row.content) contextMemos.push({ content: row.content });
                }
              } else if (mode === "older-random") {
                // 昨日回声：随机取几条旧记录，交给模型找真实张力
                const pickedIds: string[] = [];
                for (let i = 0; i < 3; i += 1) {
                  const picked = await getRandomMemo(db, user, pickedIds);
                  if (!picked?.content) break;
                  pickedIds.push(picked.id);
                  contextMemos.push({ content: picked.content });
                }
              } else if (mode === "none") {
                // 显式不取数
              } else if (provider && index) {
                const ragQuery = skill?.ragHint?.trim() || content;
                const hits = await semanticSearchMemos(
                  db,
                  user,
                  {
                    provider,
                    index,
                    namespaces: memoSearchNamespaces(c.env, user, undefined),
                  },
                  ragQuery,
                  5,
                );
                if (hits.length > 0) {
                  const memos = await getSemanticSearchMemos(
                    db,
                    user,
                    hits.map((hit) => hit.id),
                  );
                  for (const memo of memos) if (memo.content) contextMemos.push({ content: memo.content });
                }
              }
            } catch (ragErr) {
              console.error("RAG failed:", ragErr);
            }
            if (contextMemos.length > 0) {
              ragContext =
                "\n\n以下是与你问题相关的记忆笔记（供回答引用，只选相关的，不要编造无关内容）：\n" +
                contextMemos
                  .map((memo, i) => `[来源${i + 1}] ${memo.content.slice(0, 500)}`)
                  .join("\n\n");
            } else if (mode === "same-day-history" || mode === "older-random") {
              // 空状态诚实告知，逼模型走护栏文案而不是编造
              ragContext = "\n\n（本次没有取到任何可引用的历史记录。）";
            }

            const systemPrompt = `你是 FlareMo 里的 AI 助手，基于用户的记忆与笔记内容简洁、直接、具体地用中文回答。${skill ? `\n\n${skill.prompt}` : ""}${ragContext}`;
            try {
              const reply = await chatWithAgentModel(c.env, db, [
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
