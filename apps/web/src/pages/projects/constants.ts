import type { TaskPriority, TaskStatus } from "@/api";
import type { TranslationKey } from "@/i18n/key";

export const ALL_TASKS = "all";

export const STATUS_COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

export const PRIORITY_BADGE: Record<
  TaskPriority,
  "destructive" | "brand" | "secondary"
> = {
  high: "destructive",
  medium: "brand",
  low: "secondary",
  none: "secondary",
};

/** Clicking the status icon advances the task; the label states the action. */
export const ADVANCE_TARGET: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export const ADVANCE_KEY: Record<TaskStatus, TranslationKey> = {
  todo: "projects.advance.start",
  in_progress: "projects.advance.complete",
  done: "projects.advance.reopen",
};

// Touch screens never hover: controls that fade in behind group-hover stay
// permanently visible on coarse pointers (7.2).
export const COARSE_VISIBLE = "[@media(pointer:coarse)]:opacity-100";
export const MORE_BUTTON_CLASS = `opacity-0 group-hover:opacity-100 focus:opacity-100 ${COARSE_VISIBLE}`;

export function isStatusColumn(id: string): boolean {
  return STATUS_COLUMNS.some((status) => status === id);
}
