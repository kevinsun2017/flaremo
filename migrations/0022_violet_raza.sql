PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memos_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receiver_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`source_event_id` text NOT NULL,
	`memo_id` text,
	`related_memo_id` text,
	`snippet` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_memos_notifications`("id", "receiver_id", "sender_id", "type", "status", "source_event_id", "memo_id", "related_memo_id", "snippet", "created_at", "updated_at") SELECT "id", "receiver_id", "sender_id", "type", "status", "source_event_id", "memo_id", "related_memo_id", "snippet", "created_at", "updated_at" FROM `memos_notifications`;--> statement-breakpoint
DROP TABLE `memos_notifications`;--> statement-breakpoint
ALTER TABLE `__new_memos_notifications` RENAME TO `memos_notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `memos_notifications_receiver_source_type_idx` ON `memos_notifications` (`receiver_id`,`source_event_id`,`type`);--> statement-breakpoint
CREATE INDEX `memos_notifications_receiver_created_id_idx` ON `memos_notifications` (`receiver_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `memos_notifications_receiver_status_created_idx` ON `memos_notifications` (`receiver_id`,`status`,`created_at`);