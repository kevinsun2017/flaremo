CREATE TABLE `auth_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`team_id` text,
	`inviter_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `auth_organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `auth_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_organizations_slug_idx` ON `auth_organizations` (`slug`);
--> statement-breakpoint
CREATE TABLE `auth_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `auth_organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_members_organization_id_idx` ON `auth_members` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `auth_members_user_id_idx` ON `auth_members` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_members_org_user_idx` ON `auth_members` (`organization_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `auth_invitations_organization_id_idx` ON `auth_invitations` (`organization_id`);
--> statement-breakpoint
-- Backfill: the deployment's single default team, seeded from the legacy
-- per-user role column before it is dropped below.
INSERT INTO `auth_organizations` (`id`, `name`, `slug`, `logo`, `metadata`, `created_at`)
SELECT 'orgs/default-team', 'FlareMo Team', 'flaremo', NULL, NULL, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM `auth_organizations` WHERE `slug` = 'flaremo');
--> statement-breakpoint
INSERT INTO `auth_members` (`id`, `organization_id`, `user_id`, `role`, `created_at`)
SELECT
	'members/' || LOWER(HEX(randomblob(16))),
	(SELECT `id` FROM `auth_organizations` WHERE `slug` = 'flaremo'),
	l.`auth_user_id`,
	CASE u.`role` WHEN 'owner' THEN 'owner' WHEN 'admin' THEN 'admin' ELSE 'member' END,
	CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `auth_user_links` l
JOIN `users` u ON u.`id` = l.`flaremo_user_id`
WHERE u.`status` = 'active'
ON CONFLICT (`organization_id`,`user_id`) DO NOTHING;
--> statement-breakpoint
ALTER TABLE `memos` ADD `team_id` text REFERENCES auth_organizations(id);
--> statement-breakpoint
UPDATE `memos`
SET `team_id` = (SELECT `id` FROM `auth_organizations` WHERE `slug` = 'flaremo')
WHERE `visibility` IN ('protected', 'public');
--> statement-breakpoint
CREATE INDEX `memos_team_visibility_status_idx` ON `memos` (`team_id`,`visibility`,`status`);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `active_organization_id` text;
--> statement-breakpoint
DROP INDEX `users_role_status_idx`;
--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;
