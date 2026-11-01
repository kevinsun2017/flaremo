import type { Task } from "@/api";

/**
 * Apply optimistic task patches to every cached task list under the ["tasks"]
 * prefix, preserving each query's other fields.
 */
export function patchTasksCacheMulti(
  data: unknown,
  patches: Map<string, Partial<Task>>,
) {
  if (!data || typeof data !== "object") return data;
  const current = data as { tasks?: Task[] };
  if (!Array.isArray(current.tasks) || patches.size === 0) return data;
  return {
    ...current,
    tasks: current.tasks.map((item) => {
      const patch = patches.get(item.id);
      return patch ? { ...item, ...patch } : item;
    }),
  };
}

/**
 * Apply an optimistic task patch (or removal with patch=null) to every cached
 * task list under the ["tasks"] prefix, preserving each query's other fields.
 */
export function patchTasksCache(
  data: unknown,
  taskId: string,
  patch: Partial<Task> | null,
): unknown {
  if (!data || typeof data !== "object") return data;
  const current = data as { tasks?: Task[] };
  if (!Array.isArray(current.tasks)) return data;
  return {
    ...current,
    tasks:
      patch === null
        ? current.tasks.filter((item) => item.id !== taskId)
        : current.tasks.map((item) =>
            item.id === taskId ? { ...item, ...patch } : item,
          ),
  };
}
