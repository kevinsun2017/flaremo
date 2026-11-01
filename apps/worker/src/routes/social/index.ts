import { Hono } from "hono";
import type { HonoBindings } from "../../context";
import { registerCommentRoutes } from "./comments";
import { registerReactionRoutes } from "./reactions";
import { registerShortcutRoutes } from "./shortcuts";

/**
 * Mount this app at `/api/v1`, before the legacy Memos app:
 *
 *   app.route("/api/v1", memosSocialApi);
 *
 * The social domain functions deliberately sit behind a small, explicit
 * contract here. The route never imports a table or builds a Drizzle query.
 * The parent implementation in `@flaremo/domain` is expected to provide:
 *
 * - `createMemoComment(db, user, { parentMemoName, content, visibility,
 *   payload, commentId })` -> `MemoRow`;
 * - `listMemoComments(db, user, { memoName, pageSize, pageToken, orderBy })`
 *   -> `{ memos: MemoRow[], nextPageToken? }`;
 * - `listMemoReactions(db, user, { memoName, pageSize, pageToken })` ->
 *   `{ reactions: MemoReactionRow[], nextPageToken? }`;
 * - `upsertMemoReaction(db, user, { memoName, contentId, reactionType })` ->
 *   `MemoReactionRow`;
 * - `deleteMemoReaction(db, user, { name, memoName, reactionId })` -> void;
 * - `listShortcuts(db, user, { parentName })` -> `ShortcutRow[]`;
 * - `getShortcut(db, user, { name })` -> `ShortcutRow`;
 * - `createShortcut(db, user, { parentName, title, filter, validateOnly })` ->
 *   `ShortcutRow`;
 * - `updateShortcut(db, user, { name, title?, filter?, updateMask })` ->
 *   `ShortcutRow`;
 * - `deleteShortcut(db, user, { name })` -> void.
 *
 * Register order is part of that contract: the calls below run in the order the
 * single-file router declared its routes.
 */
export const memosSocialApi = new Hono<HonoBindings>();

registerCommentRoutes(memosSocialApi);
registerReactionRoutes(memosSocialApi);
registerShortcutRoutes(memosSocialApi);
