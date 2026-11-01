import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    status: text("status", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_status_idx").on(table.status),
  ],
);

// Better Auth owns authentication identities. These tables intentionally stay
// separate from the domain `users` table above so existing memo, attachment,
// share, and R2 ownership identifiers remain stable during the auth cutover.
//
// Better Auth hands real Date objects to the Drizzle adapter, so its timestamp
// columns use `timestamp_ms` rather than the domain tables' ISO text dates.
const authTimestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const authUsers = sqliteTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    username: text("username"),
    displayUsername: text("display_username"),
    createdAt: authTimestamp("created_at").notNull(),
    updatedAt: authTimestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_users_email_idx").on(table.email),
    uniqueIndex("auth_users_username_idx").on(table.username),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: authTimestamp("expires_at").notNull(),
    token: text("token").notNull(),
    createdAt: authTimestamp("created_at").notNull(),
    updatedAt: authTimestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // Better Auth organization plugin field. FlareMo always resolves the
    // deployment's default organization directly, so this stays advisory for
    // the plugin's own client flows.
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_idx").on(table.token),
    index("auth_sessions_user_id_idx").on(table.userId),
  ],
);

export const authAccounts = sqliteTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: authTimestamp("access_token_expires_at"),
    refreshTokenExpiresAt: authTimestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authTimestamp("created_at").notNull(),
    updatedAt: authTimestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
    index("auth_accounts_user_id_idx").on(table.userId),
  ],
);

export const authVerifications = sqliteTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authTimestamp("expires_at").notNull(),
    createdAt: authTimestamp("created_at").notNull(),
    updatedAt: authTimestamp("updated_at").notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const authApiKeys = sqliteTable(
  "auth_apikeys",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull().default("memos"),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: authTimestamp("last_refill_at"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: authTimestamp("last_request"),
    expiresAt: authTimestamp("expires_at"),
    permissions: text("permissions"),
    metadata: text("metadata"),
    createdAt: authTimestamp("created_at").notNull(),
    updatedAt: authTimestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_apikeys_key_idx").on(table.key),
    index("auth_apikeys_reference_config_idx").on(
      table.referenceId,
      table.configId,
    ),
    index("auth_apikeys_expires_at_idx").on(table.expiresAt),
  ],
);

// This one-to-one bridge is the only authentication-to-domain ownership
// mapping. A future multi-user feature can add more mapped pairs without
// changing any existing FlareMo resource IDs.
export const authUserLinks = sqliteTable(
  "auth_user_links",
  {
    authUserId: text("auth_user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    flaremoUserId: text("flaremo_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: authTimestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_user_links_flaremo_user_id_idx").on(table.flaremoUserId),
  ],
);

export const authBootstrap = sqliteTable("auth_bootstrap", {
  id: text("id").primaryKey(),
  state: text("state", {
    enum: ["initializing", "complete", "recovery_required"],
  }).notNull(),
  authUserId: text("auth_user_id").references(() => authUsers.id, {
    onDelete: "restrict",
  }),
  flaremoUserId: text("flaremo_user_id").references(() => users.id, {
    onDelete: "restrict",
  }),
  createdAt: authTimestamp("created_at").notNull(),
  completedAt: authTimestamp("completed_at"),
});

// Better Auth organization plugin tables — the single source of truth for
// team membership and roles. FlareMo keeps exactly one organization per
// deployment (the default team created at bootstrap), so a user's team role
// is the role of their row in `auth_members` for that organization.
export const authOrganizations = sqliteTable(
  "auth_organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: authTimestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("auth_organizations_slug_idx").on(table.slug)],
);

export const authMembers = sqliteTable(
  "auth_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => authOrganizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // "reader" is a read-only, optionally time-boxed seat: readers browse the
    // team space but can never publish into it (resolveMemoTeamId denies
    // them). expiresAt only carries meaning for readers; an expired reader is
    // treated as a non-member at membership resolution (fail-closed), so no
    // cron sweep is needed to cut off access.
    role: text("role", {
      enum: ["owner", "admin", "member", "reader"],
    }).notNull(),
    expiresAt: authTimestamp("expires_at"),
    createdAt: authTimestamp("created_at").notNull(),
  },
  (table) => [
    index("auth_members_organization_id_idx").on(table.organizationId),
    index("auth_members_user_id_idx").on(table.userId),
    uniqueIndex("auth_members_org_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const authInvitations = sqliteTable(
  "auth_invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => authOrganizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "rejected", "canceled"],
    })
      .notNull()
      .default("pending"),
    teamId: text("team_id"),
    inviterId: text("inviter_id").notNull(),
    expiresAt: authTimestamp("expires_at").notNull(),
    createdAt: authTimestamp("created_at").notNull(),
  },
  (table) => [
    index("auth_invitations_organization_id_idx").on(table.organizationId),
  ],
);
