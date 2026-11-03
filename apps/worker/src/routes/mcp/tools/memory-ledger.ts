import { eq, and } from "drizzle-orm";
import type { ReturnTypeOfRequestContext } from "../../../context";
import { type JsonObject, optionalString } from "../../../mcp-protocol";
import { requiredString } from "../input";
import { memos } from "@flaremo/db";
import { memoReadScope } from "@flaremo/domain";

// ---------------------------------------------------------------------------
// Memory ledger — minimal flomo-style memory on top of tagged memos.
//
// The 2026-11-03 decision: keep the "pick / consolidate / image" core of the
// v0.26 memory ledger, but store it as a specially-tagged memo instead of
// resurrecting the v0.26 table structure. Tagged memos carry the memory in
// `payload.memory` and keep the human-readable fact in `content` so it stays
// RAG-addressable without polluting the shared memo recall space (embedding
// uses `content` only; `payload` never enters the index).
//
// Guardrail (Standard tier): each memory is fingerprinted (pure SHA-256 over
// owner+type+kind+scope+content) and the fingerprint is stored in
// `payload.memory.fingerprint`. `remember` declines a write whose fingerprint
// already exists among the caller's live memory memos — cheap content-level
// de-dup without a rejection table.
// ---------------------------------------------------------------------------

const MEMORY_TAG = "memory:ledger";
const MEMORY_PAYLOAD_VERSION = 1;

type MemoryLedgerEntry = {
  version: typeof MEMORY_PAYLOAD_VERSION;
  type: "semantic" | "episodic" | "procedural";
  kind: "preference" | "fact" | "decision" | "constraint" | "lesson";
  fingerprint: string;
  source?: string;
  createdAt: string;
};

export async function computeMemoryFingerprint(params: {
  userId: string;
  content: string;
  type: string;
  kind: string;
  scopeType: string;
  scopeKey: string | null;
}): Promise<string> {
  const canonical = [
    params.userId,
    params.type,
    params.kind,
    params.scopeType,
    params.scopeKey ?? "",
    params.content,
  ].join("\u001f");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isMemoryMemo(payload: unknown): payload is { memory?: MemoryLedgerEntry } {
  return typeof payload === "object" && payload !== null;
}

async function findExistingFingerprint(
  context: ReturnTypeOfRequestContext,
  fingerprint: string,
): Promise<boolean> {
  const rows = await context.db
    .select({ id: memos.id })
    .from(memos)
    .where(and(memoReadScope(context.user), eq(memos.status, "normal")));
  // payload is a JSON column; filter in-process (tags are rare enough that a
  // full scan of the caller's normal memos is acceptable for the ledger path).
  for (const row of rows) {
    const full = await context.db
      .select({ payload: memos.payload })
      .from(memos)
      .where(eq(memos.id, row.id));
    const payload = full[0]?.payload;
    if (!isMemoryMemo(payload) || !payload.memory) continue;
    if (payload.memory.fingerprint === fingerprint) return true;
  }
  return false;
}

export async function streamableMemoryRemember(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const content = requiredString(args, "content");
  const kind = optionalString(args, "kind") ?? "fact";
  const type = optionalString(args, "type") ?? "semantic";

  const fingerprint = await computeMemoryFingerprint({
    userId: context.user.id,
    content,
    type,
    kind,
    scopeType: "global",
    scopeKey: null,
  });

  if (await findExistingFingerprint(context, fingerprint)) {
    return {
      remembered: false,
      reason: "duplicate: identical memory already in ledger",
      fingerprint,
    };
  }

  const entry: MemoryLedgerEntry = {
    version: MEMORY_PAYLOAD_VERSION,
    type: type as MemoryLedgerEntry["type"],
    kind: kind as MemoryLedgerEntry["kind"],
    fingerprint,
    source: optionalString(args, "source"),
    createdAt: new Date().toISOString(),
  };

  await context.db.insert(memos).values({
    id: crypto.randomUUID(),
    userId: context.user.id,
    content,
    visibility: "private",
    status: "normal",
    source: "mcp:memory",
    payload: { memory: entry, tags: [MEMORY_TAG] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { remembered: true, fingerprint };
}

export type LedgerMemo = {
  id: string;
  content: string;
  memory: MemoryLedgerEntry;
};

export async function streamableMemoryRecall(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
): Promise<{ memos: LedgerMemo[] }> {
  const rows = await context.db
    .select()
    .from(memos)
    .where(and(memoReadScope(context.user), eq(memos.status, "normal")));
  const out: LedgerMemo[] = [];
  for (const row of rows) {
    if (!isMemoryMemo(row.payload) || !row.payload.memory) continue;
    out.push({ id: row.id, content: row.content, memory: row.payload.memory });
  }
  return { memos: out };
}

export async function streamableMemoryCompile(
  context: ReturnTypeOfRequestContext,
  args: JsonObject,
) {
  const recalled = await streamableMemoryRecall(context, args);
  // Imaging: project the ledger into a compact, ordered fact list. (Caller
  // asks the LLM to summarize this projection; we only gather the facts.)
  const facts = recalled.memos.map((m) => m.content);
  return { facts, count: facts.length };
}