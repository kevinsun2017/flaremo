import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Instance-wide encrypted service credentials. Never part of user memo exports.
export const voiceServiceConfig = sqliteTable("voice_service_config", {
  id: text("id").primaryKey(),
  revision: text("revision").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  ciphertext: text("ciphertext"),
});

// Instance-wide integration settings (email sending, OAuth providers) that
// carry secrets in the same encrypted-envelope pattern as voice_service_config.
// One row per integration id ("email", "oauth"); never part of memo exports.
export const integrationConfig = sqliteTable("integration_config", {
  id: text("id").primaryKey(),
  revision: text("revision").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  ciphertext: text("ciphertext"),
});
