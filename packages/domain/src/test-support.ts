import { authUsers, type FlareMoDb } from "@flaremo/db";
import { completeOwnerBootstrap, getViewerTeamMembership } from "./auth";
import type { TeamViewer } from "./team-permissions";
import { createFlaremoMemberWithLink, ensureSingleUser } from "./users";

/**
 * Vitest-only provisioning helpers. They exercise the same production paths
 * (bootstrap owner membership, member provisioning) so tests never hand-roll
 * permission state that the domain code would reject.
 */

async function insertTestAuthUser(
  db: FlareMoDb,
  authUserId: string,
  email: string,
  name: string,
): Promise<void> {
  const now = new Date();
  await db.insert(authUsers).values({
    id: authUserId,
    email,
    name,
    emailVerified: true,
    image: null,
    username: `test-${authUserId.replaceAll(/[^a-z0-9]/gi, "")}`,
    displayUsername: name,
    createdAt: now,
    updatedAt: now,
  });
}

/** Provision the bootstrap owner with a default-team owner membership. */
export async function ensureTeamOwner(db: FlareMoDb): Promise<TeamViewer> {
  const owner = await ensureSingleUser(db, {
    email: "owner@example.com",
    name: "Owner",
  });
  const authUserId = "auth/test-owner";
  await insertTestAuthUser(db, authUserId, "owner@example.com", "Owner");
  await completeOwnerBootstrap(db, {
    authUserId,
    singleUser: { email: "owner@example.com", name: "Owner" },
  });
  const membership = await getViewerTeamMembership(db, authUserId);
  if (!membership) {
    throw new Error("Owner membership was not provisioned");
  }
  return {
    ...owner,
    teamRole: membership.role,
    teamOrganizationId: membership.organizationId,
  };
}

/** Provision a regular member through the production member path. */
export async function createTeamMember(
  db: FlareMoDb,
  name: string,
): Promise<TeamViewer> {
  const slug = `member-${name.toLowerCase().replaceAll(/[^a-z0-9]/g, "-")}`;
  const email = `${slug}@example.com`;
  const authUserId = `auth/${slug}`;
  await insertTestAuthUser(db, authUserId, email, name);
  const member = await createFlaremoMemberWithLink(db, {
    authUserId,
    email,
    name,
  });
  const membership = await getViewerTeamMembership(db, authUserId);
  if (!membership) {
    throw new Error("Member membership was not provisioned");
  }
  return {
    ...member,
    teamRole: membership.role,
    teamOrganizationId: membership.organizationId,
  };
}
