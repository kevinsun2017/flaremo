/**
 * Service names the Connect endpoint compares more than once. The MemoService
 * literal used to live in the route module and is now shared by the body
 * decoder (GetSharedMemo alias) and the dispatch table.
 */
export const memoService = "memos.api.v1.MemoService";
