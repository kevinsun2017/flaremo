import { TriangleAlertIcon } from "lucide-react";
import { Component, lazy, memo, type ReactNode, Suspense } from "react";
import { useI18n } from "@/i18n";

const MarkdownMemoContent = lazy(() =>
  import("./memo-content").then((module) => ({ default: module.MemoContent })),
);

function PlainMemoContent({
  className,
  content,
}: {
  className?: string;
  content: string;
}) {
  return (
    <div className={className ?? "text-[15px] leading-7 whitespace-pre-wrap"}>
      {content}
    </div>
  );
}

/** Visible marker for the failed-degradation path: the lazy markdown chunk did
 *  not load (offline cold cache, stale deploy, build error, …). Notes stay
 *  readable as plain text, but the reader should know the rich rendering was
 *  skipped instead of assuming this is the formatted output. */
function DegradedNotice() {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning-emphasis">
      <TriangleAlertIcon className="size-3.5 shrink-0" />
      <span>{t("common.renderFallback")}</span>
    </div>
  );
}

export function FallbackContent({
  className,
  content,
}: {
  className?: string;
  content: string;
}) {
  return (
    <div>
      <DegradedNotice />
      <PlainMemoContent className={className} content={content} />
    </div>
  );
}

/**
 * The Markdown renderer is a lazy chunk. When it cannot load (offline with a
 * cold cache, a stale deploy, …) notes must stay readable instead of taking
 * down the whole route, so import failures fall back to plain text.
 */
class MemoContentErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export const LazyMemoContent = memo(function LazyMemoContent({
  className,
  content,
  onTimestampClick,
  withHeadingIds,
  interactiveTaskLists,
  resolveImageDimensions,
  onToggleTask,
  onConvertTask,
  onTagClick,
  rehypePlugins,
}: {
  className?: string;
  content: string;
  onTimestampClick?: (seconds: number) => void;
  withHeadingIds?: boolean;
  interactiveTaskLists?: boolean;
  resolveImageDimensions?: (
    src: string,
  ) => { width: number; height: number } | undefined;
  /** D2: live GFM checkboxes in the read view; see MemoContent. */
  onToggleTask?: (lineIndex: number, checked: boolean) => void;
  onConvertTask?: (lineIndex: number, text: string) => void;
  /** In-text `#tags` filter the timeline when given. */
  onTagClick?: (tag: string) => void;
  /** Article-surface extras (Shiki); see MemoContent. */
  rehypePlugins?: import("unified").Pluggable[];
}) {
  return (
    <MemoContentErrorBoundary
      fallback={<FallbackContent className={className} content={content} />}
    >
      <Suspense
        fallback={<PlainMemoContent className={className} content={content} />}
      >
        <MarkdownMemoContent
          className={className}
          content={content}
          interactiveTaskLists={interactiveTaskLists}
          onTagClick={onTagClick}
          onTimestampClick={onTimestampClick}
          rehypePlugins={rehypePlugins}
          resolveImageDimensions={resolveImageDimensions}
          withHeadingIds={withHeadingIds}
          onToggleTask={onToggleTask}
          onConvertTask={onConvertTask}
        />
      </Suspense>
    </MemoContentErrorBoundary>
  );
});
