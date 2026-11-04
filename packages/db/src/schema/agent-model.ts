import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Instance-wide Agent LLM configuration (model selection, optional).
 *
 * Envelope follows the voice_service_config pattern: one row (id "instance")
 * holding a revision-matched, optional AES-GCM ciphertext. While unset, the
 * Worker falls back to FLAREMO_LLM_API_URL / _API_KEY / _MODEL secrets — so
 * existing installs keep working with zero config.
 *
 * Kept deliberately minimal in schema; wider / per-user selection can be
 * layered above this later without a shape migration (the payload is opaque).
 */
export const agentModelConfig = sqliteTable("agent_model_config", {
  id: text("id").primaryKey(),
  revision: text("revision").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  ciphertext: text("ciphertext"),
});