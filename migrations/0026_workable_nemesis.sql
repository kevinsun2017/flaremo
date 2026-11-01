CREATE INDEX `memos_recycle_sweep_idx` ON `memos` (`deleted_at`) WHERE status = 'trashed';--> statement-breakpoint
CREATE INDEX `projects_recycle_sweep_idx` ON `projects` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `tasks_recycle_sweep_idx` ON `tasks` (`deleted_at`);