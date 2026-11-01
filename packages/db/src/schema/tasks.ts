import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

// Projects group tasks. They are first-class domain resources (not memo tags)
// so agents and scripts can read a stable "what projects do I have, how many
// tasks in each" through the app API without re-parsing memo markdown.
// `deleted_at` is the recycle-bin marker: delete writes the timestamp, restore
// clears it, and the daily cron hard-deletes rows past the TTL window.
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("projects_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    // Daily recycle-bin TTL sweep scans `deleted_at < cutoff`.
    index("projects_recycle_sweep_idx").on(table.deletedAt),
  ],
);

// Tasks are thin, ordered work items under a project. `status` and `sort_order`
// are columns (not a JSON payload) so list/board grouping stays indexable.
// `project_id` is nullable: a task without a project is an "unassigned" item
// that shows up in the all-tasks view. `source_memo_id` links back to the memo
// a task was upgraded from; it is intentionally FK-free (a memo hard-delete
// must not cascade into tasks) and validated at read time.
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    sourceMemoId: text("source_memo_id"),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status", { enum: ["todo", "in_progress", "done"] })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["none", "low", "medium", "high"] })
      .notNull()
      .default("none"),
    dueAt: text("due_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: text("completed_at"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("tasks_user_project_status_sort_idx").on(
      table.userId,
      table.projectId,
      table.status,
      table.sortOrder,
    ),
    index("tasks_user_due_idx").on(table.userId, table.dueAt),
    // Daily recycle-bin TTL sweep scans `deleted_at < cutoff`.
    index("tasks_recycle_sweep_idx").on(table.deletedAt),
  ],
);

// An append-only audit trail per task mutation. Agents get full write access,
// so observability (who changed what, when) is what makes that trustable and
// reversible rather than gating the agent's permissions. `task_id` is null for
// project-scoped events (e.g. reorders) that do not target a single task.
// The trail shares the task's lifecycle: it survives a recycle-bin delete and
// is cascade-deleted only when the task row itself is hard-deleted.
export const taskActivity = sqliteTable(
  "task_activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { enum: ["user", "agent"] }).notNull(),
    actorName: text("actor_name"),
    action: text("action", {
      enum: ["created", "updated", "status_changed", "reordered"],
    }).notNull(),
    changes: text("changes", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("task_activity_task_created_idx").on(table.taskId, table.createdAt),
    index("task_activity_user_created_idx").on(table.userId, table.createdAt),
  ],
);
