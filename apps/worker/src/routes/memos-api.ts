/**
 * Barrel for the legacy Memos REST router, which now lives split by domain
 * under `routes/memos-api/`. The import path and the exported instance are
 * unchanged for existing importers.
 */
export * from "./memos-api/index";
