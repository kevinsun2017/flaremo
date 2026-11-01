import { type FlareMoDb, voiceServiceConfig } from "@flaremo/db";
import { and, eq } from "drizzle-orm";

import { isInstanceOwner, type TeamViewer } from "./team-permissions";

// Voice credentials are billing-level instance secrets, so management stays
// at the same owner-only tier as branding and other instance-wide settings.
export function canManageVoiceService(user: TeamViewer | null): boolean {
  return isInstanceOwner(user);
}

export async function readVoiceService(db: FlareMoDb) {
  return db.query.voiceServiceConfig.findFirst({
    where: eq(voiceServiceConfig.id, "instance"),
  });
}

// Revision matching prevents two open admin forms from overwriting each other.
export async function writeVoiceService(
  db: FlareMoDb,
  previous: string | null,
  value: {
    enabled: boolean;
    ciphertext: string | null;
  },
) {
  const revision = crypto.randomUUID();
  if (previous === null) {
    const rows = await db
      .insert(voiceServiceConfig)
      .values({ id: "instance", revision, ...value })
      .onConflictDoNothing()
      .returning({ revision: voiceServiceConfig.revision });
    return rows.length > 0;
  }
  const rows = await db
    .update(voiceServiceConfig)
    .set({ revision, ...value })
    .where(
      and(
        eq(voiceServiceConfig.id, "instance"),
        eq(voiceServiceConfig.revision, previous),
      ),
    )
    .returning({ revision: voiceServiceConfig.revision });
  return rows.length > 0;
}
