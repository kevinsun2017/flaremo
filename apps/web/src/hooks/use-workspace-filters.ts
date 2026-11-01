import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { MemoSpace } from "@/api";
import type { ExplorerView as ViewMode } from "@/components/flaremo-explorer";
import { dayFilterFromQuery } from "@/lib/calendar-date";

/** The validated `/?` search params, as `indexRoute.useSearch()` returns them. */
type WorkspaceSearch = {
  view?: ViewMode;
  space?: MemoSpace;
  q?: string;
  tag?: string;
  untagged?: boolean;
  compose?: boolean;
};

/**
 * The workspace's URL-backed filters: every search param read as plain state,
 * next to the setters that write one back to the URL (`replace`, so filtering
 * never stacks history entries).
 */
export function useWorkspaceFilters(search: WorkspaceSearch) {
  const navigate = useNavigate({ from: "/" });
  const view = search.view ?? "all";
  const space = search.space ?? "all";
  const activeTag = search.tag;
  const untagged = Boolean(search.untagged);
  const query = search.q ?? "";
  const composeRequested = Boolean(search.compose);
  // A query that is exactly one local day is not a text search; it renders as
  // a removable date chip and the search box stays empty.
  const dayFilter = dayFilterFromQuery(query);
  const setView = useCallback(
    (nextView: ViewMode) => {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, view: nextView }),
      });
    },
    [navigate],
  );
  const setSpace = useCallback(
    (nextSpace: MemoSpace) => {
      void navigate({
        replace: true,
        // "all" is the default scope, so it stays off the URL entirely.
        search: (current) => ({
          ...current,
          space: nextSpace === "all" ? undefined : nextSpace,
        }),
      });
    },
    [navigate],
  );
  const setActiveTag = useCallback(
    (tag: string | undefined) => {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, tag, untagged: undefined }),
      });
    },
    [navigate],
  );
  const setUntagged = useCallback(
    (next: boolean) => {
      void navigate({
        replace: true,
        search: (current) => ({
          ...current,
          tag: undefined,
          untagged: next || undefined,
        }),
      });
    },
    [navigate],
  );
  const setQuery = useCallback(
    (q: string) => {
      void navigate({
        replace: true,
        search: (current) => ({
          ...current,
          q: q || undefined,
          view: q.trim() ? "all" : "view" in current ? current.view : undefined,
        }),
      });
    },
    [navigate],
  );
  const clearFilters = useCallback(() => {
    void navigate({
      replace: true,
      search: (current) => ({
        ...current,
        q: undefined,
        tag: undefined,
        untagged: undefined,
      }),
    });
  }, [navigate]);

  return {
    activeTag,
    clearFilters,
    composeRequested,
    dayFilter,
    query,
    setActiveTag,
    setQuery,
    setSpace,
    setUntagged,
    setView,
    space,
    untagged,
    view,
  };
}
