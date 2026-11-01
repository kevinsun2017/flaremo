import type { MemoPayload, MemoRow } from "@flaremo/db";
import { ForbiddenError, ValidationError } from "./errors";
import { canPublishTeamMemo, type TeamViewer } from "./team-permissions";

// The contracts schemas cap memo content at 100_000 characters for web/MCP
// writes, but Memos-compatible writes (connect/social/REST) reach these
// domain functions directly, so the same ceilings are enforced here. The
// payload check lives in normalizeMemoPayload, the single point shared by
// createMemo, updateMemo, and the import path.
const MAX_MEMO_CONTENT_LENGTH = 100_000;
const MAX_MEMO_PAYLOAD_JSON_LENGTH = 100_000;

/**
 * Candidate-row ceiling for CEL filters that cannot be fully translated to
 * SQL. Starred higher than attachment filters because memo scans may include
 * an unbounded visibility window; deployments on quota-sensitive plans can
 * lower it via FLAREMO_MEMO_FILTER_SCAN_LIMIT.
 */
export const DEFAULT_MEMO_FILTER_SCAN_LIMIT = 5_000;

/**
 * Parse FLAREMO_MEMO_FILTER_SCAN_LIMIT. Values below the page-sized floor,
 * above the hard cap of 50000, or non-integers fall back to the default.
 */
export function parseMemoFilterScanLimit(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== value.trim()) {
    return undefined;
  }
  return parsed;
}

/** Shared by every memo write path (create, update, comments, import). */
export function assertMemoContentSize(content: string) {
  if (content.length > MAX_MEMO_CONTENT_LENGTH) {
    throw new ValidationError(
      `Memo content exceeds the ${MAX_MEMO_CONTENT_LENGTH} character limit`,
    );
  }
}

/**
 * Resolve the owning team for a memo from its visibility. Personal memos
 * ("private") carry no team; team/public memos are published into the
 * viewer's team, which requires an actual team membership. Readers are the
 * read-only seat: every publishing path (create, republish, and PAT/API
 * writes) funnels through here, so this single denial closes them all.
 */
export function resolveMemoTeamId(
  viewer: TeamViewer,
  visibility: MemoRow["visibility"],
): string | null {
  if (visibility === "private") return null;
  if (!canPublishTeamMemo(viewer)) {
    throw new ForbiddenError("Read-only members cannot publish team memos.");
  }
  const teamId = viewer.teamOrganizationId ?? null;
  if (!teamId) {
    throw new ValidationError(
      "Team membership is required to publish a team memo.",
    );
  }
  return teamId;
}

export function normalizeMemoPayload(payload: unknown): MemoPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const normalized = { ...(payload as MemoPayload) };
  if (JSON.stringify(normalized).length > MAX_MEMO_PAYLOAD_JSON_LENGTH) {
    throw new ValidationError(
      `Memo payload exceeds the ${MAX_MEMO_PAYLOAD_JSON_LENGTH} character limit`,
    );
  }
  return normalized;
}

export function normalizeMemoClientId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const clientId = value.trim();
  return clientId && clientId.length <= 128 ? clientId : undefined;
}

// Unchecked item of a Markdown task list: `- [ ]`, `* [ ]`, `+ [ ]` or an
// ordered `1. [ ]` variant, at the start of a line.
export function hasUncheckedTaskList(content: string): boolean {
  return /(?:^|\n)[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[ \]/.test(content);
}
