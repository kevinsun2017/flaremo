import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Assistant 等待态气泡。
 *
 * `slow` 决定形态：默认是三点加载；`slow` 为真表示快轮询的 60 秒兜底已经到点、
 * 但回复仍未落地 —— 此时**不能消失**，改显「仍在处理」，由外层继续慢轮询直到回复到达。
 * 可见性由消息内容驱动（最后一条是不是 user），不靠计时器，所以切会话/刷新都不会误留。
 */
export function AgentPendingBubble({ slow }: { slow?: boolean }) {
  const { t } = useI18n();
  const bubble =
    "max-w-[85%] rounded-xl border border-border/50 bg-card/50 shadow-xs";

  if (slow) {
    return (
      <div className="flex w-full justify-start" role="status" aria-live="polite">
        <div className={cn(bubble, "p-3 text-sm text-muted-foreground")}>
          {t("agent.stillProcessing")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      <div className={cn(bubble, "flex items-center gap-1.5 px-3.5 py-3.5")}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 animate-bounce rounded-full bg-muted-foreground/70",
              "motion-reduce:animate-none",
            )}
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
        <span className="sr-only">{t("agent.pending")}</span>
      </div>
    </div>
  );
}
