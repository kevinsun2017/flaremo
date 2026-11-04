import { type FlareMoDb, agentModelConfig } from "@flaremo/db";
import { and, eq } from "drizzle-orm";

import { isInstanceOwner, type TeamViewer } from "./team-permissions";

// Agent LLM selection is an instance-level setting (billing/token secrets),
// managed at the same owner-only tier as voice config and branding.
export function canManageAgentModel(user: TeamViewer | null): boolean {
  return isInstanceOwner(user);
}

export async function readAgentModelConfig(db: FlareMoDb) {
  return db.query.agentModelConfig.findFirst({
    where: eq(agentModelConfig.id, "instance"),
  });
}

// Revision matching prevents two open admin forms from overwriting each other.
// Idempotent insert (onConflictDoNothing) keeps upgrades / re-runs from ever
// clobbering a saved configuration: if a row already exists we always take the
// update path guarded by the revision, never a blind overwrite.
export async function writeAgentModelConfig(
  db: FlareMoDb,
  previous: string | null,
  value: { enabled: boolean; ciphertext: string | null },
) {
  const revision = crypto.randomUUID();
  if (previous === null) {
    const rows = await db
      .insert(agentModelConfig)
      .values({ id: "instance", revision, ...value })
      .onConflictDoNothing()
      .returning({ revision: agentModelConfig.revision });
    return { ok: rows.length > 0, revision: rows[0]?.revision };
  }
  const rows = await db
    .update(agentModelConfig)
    .set({ revision, ...value })
    .where(
      and(
        eq(agentModelConfig.id, "instance"),
        eq(agentModelConfig.revision, previous),
      ),
    )
    .returning({ revision: agentModelConfig.revision });
  return { ok: rows.length > 0, revision: rows[0]?.revision };
}

export async function clearAgentModelConfig(db: FlareMoDb) {
  await db.delete(agentModelConfig).where(eq(agentModelConfig.id, "instance"));
}