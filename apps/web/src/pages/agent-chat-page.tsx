import type { AgentSkillId } from "@flaremo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  AtSignIcon,
  BookOpenTextIcon,
  BotIcon,
  ChevronDownIcon,
  ClockIcon,
  ImageIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  type AgentChatMessage,
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
} from "@/api";
import { ApiError } from "@/api/client";
import { AgentPendingBubble } from "@/components/agent-pending-bubble";
import {
  AGENT_SKILL_KEYS,
  AgentSkillsMenu,
} from "@/components/agent-skills-menu";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** Mobile = below the workspace desktop breakpoint (768px). The Agent page
 *  switches to a flomo-style full-screen sheet on phones so the keyboard and
 *  gesture affordances match a native app; the floating panel stays on desktop. */
const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false, // SSR default: desktop-ish so the floating bubble is the first paint.
  );
}

/**
 * flomo-style Agent chat, rendered as a floating bubble in the bottom-right
 * corner (workspace only). Clicking the bubble opens a compact popover with a
 * single conversational thread; the bubble stays overlaid on every page.
 *
 * A conversation is created lazily on first open (or on "new conversation"),
 * so there is no rail to manage — just one grounded chat like flomo's panel.
 */
export function AgentChatDialog() {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  useEffect(() => {
    if (!agentMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const card = document.querySelector("[data-agent-menu]");
      if (card && !card.contains(target)) setAgentMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [agentMenuOpen]);
  const [menuTab, setMenuTab] = useState<"chat" | "tasks">("chat");
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("flaremo:open-agent", handler);
    return () => window.removeEventListener("flaremo:open-agent", handler);
  }, []);
  const [docked, setDocked] = useState(() => {
    try {
      return localStorage.getItem("flaremo.agent.docked") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("flaremo.agent.docked", docked ? "1" : "0");
    } catch {
      // ignore
    }
  }, [docked]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // assistant message id -> memo ids it was grounded on (from the POST reply).
  // Not persisted server-side yet: source persistence needs a worker migration
  // (sources live on the POST response, not in agent_chat_messages).
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [awaitingReply, setAwaitingReply] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

  // Mobile: pull-down-to-close the full-screen sheet. Only armed when the chat
  // list is scrolled to the top, so it never fights the chat scroll itself.
  // The sheet's scroll area uses `overscroll-behavior-contain` so the browser's
  // own pull-to-refresh is not triggered by the same gesture.
  useEffect(() => {
    if (!isMobile || !open) return;
    const el = panelRef.current;
    if (!el) return;
    const scrollEl = el.querySelector<HTMLElement>("[data-agent-scroll]");
    const onTouchStart = (e: TouchEvent) => {
      const scrollTop = scrollEl?.scrollTop ?? 0;
      if (scrollTop > 0) {
        touchStartRef.current = null;
        return;
      }
      touchStartRef.current = { y: e.touches[0]?.clientY ?? 0, scrollTop };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const dy = (e.touches[0]?.clientY ?? 0) - touchStartRef.current.y;
      // Pull down beyond ~64px (loose threshold) closes the sheet.
      if (dy > 64) {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        const didClose = start.scrollTop <= 0;
        if (didClose) setOpen(false);
        return;
      }
    };
    const onTouchEnd = () => {
      touchStartRef.current = null;
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, open]);

  // Mobile: keep the composer visible above the virtual keyboard. Some mobile
  // browsers keep the layout viewport fixed while the visual viewport shrinks,
  // which would cover the input; the sheet stays `inset-0` full-screen and we
  // scroll the composer into view so the keyboard never hides the field.
  useEffect(() => {
    if (!isMobile || !open) return;
    const vv = window.visualViewport;
    const el = panelRef.current;
    if (!vv || !el) return;
    const onResize = () => {
      requestAnimationFrame(() => {
        const composer = el.querySelector<HTMLElement>("[data-agent-composer]");
        composer?.scrollIntoView({
          block: "end",
          behavior: "instant" as ScrollBehavior,
        });
      });
    };
    vv.addEventListener("resize", onResize);
    // Also reposition when the field gains focus (keyboard animation timing).
    el.addEventListener("focusin", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      el.removeEventListener("focusin", onResize);
    };
  }, [isMobile, open]);

  const conversations = useQuery({
    queryKey: queryKeys.agent.conversations,
    queryFn: listConversations,
  });

  const messages = useQuery({
    queryKey: queryKeys.agent.messages(activeId ?? ""),
    queryFn: () => listMessages(activeId!),
    enabled: !!activeId,
    // Keep the already-rendered list while polling/refetching so the panel
    // never flashes blank mid-send (user content "disappears").
    placeholderData: (prev) => prev,
  });

  // Autocreate the first conversation when the panel opens and none is active.
  const create = useMutation({
    mutationFn: createConversation,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.agent.conversations });
      setActiveId(data.conversation.id);
    },
    onError: () => toast.error(t("agent.createFailed")),
  });

  useEffect(() => {
    if (
      open &&
      !activeId &&
      !create.isPending &&
      !create.isSuccess &&
      conversations.isSuccess
    ) {
      create.mutate();
    }
  }, [open, activeId, create, conversations.isSuccess]);

  // Close when clicking outside the panel (bubble is a sibling, not inside).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const bubble = document.querySelector<HTMLElement>("[data-agent-bubble]");
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !bubble?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Poll for the assistant reply after an async send (POST returns 202 immediately).
  useEffect(() => {
    if (!open || !activeId || !awaitingReply) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: queryKeys.agent.messages(activeId) });
    }, 1000);
    const timeout = setTimeout(() => setAwaitingReply(false), 60000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [open, activeId, awaitingReply, qc]);

  useEffect(() => {
    if (!awaitingReply) return;
    const msgs = messages.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") setAwaitingReply(false);
  }, [messages.data, awaitingReply]);

  // 可见性由内容驱动：最后一条是 user 就是还在等回复。快轮询的 60 秒兜底只停快轮询，
  // 这里接着慢轮询，气泡因此不会凭空消失（超时会降级成「仍在处理」）。
  const pendingReply = (messages.data?.messages ?? []).at(-1)?.role === "user";
  useEffect(() => {
    if (!open || !activeId || awaitingReply || !pendingReply) return;
    const slow = setInterval(() => {
      qc.invalidateQueries({ queryKey: queryKeys.agent.messages(activeId) });
    }, 5000);
    return () => clearInterval(slow);
  }, [open, activeId, awaitingReply, pendingReply, qc]);

  const startNew = () => {
    setSources({});
    create.mutate();
  };

  return (
    <>
      {/* Floating action button (bottom-right, above everything).
          flomo behavior: the bubble disappears while the panel is open. */}
      {!open && (
        <button
          data-agent-bubble
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("agent.title")}
          className="fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <BotIcon className="size-6" />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t("agent.title")}
          className={cn(
            "z-50 flex flex-col overflow-hidden border border-border/60 bg-background shadow-2xl",
            isMobile
              ? // flomo-style full-screen sheet on phones; borderless, edge to edge.
                "fixed inset-0 rounded-none border-0"
              : docked
                ? "fixed right-0 top-0 h-svh w-[380px] max-w-[calc(100vw-3rem)] rounded-none border-r-0"
                : "fixed bottom-20 right-6 h-[560px] w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl",
          )}
        >
          {/* Header. Mobile: flomo-style full-screen bar (X close / title /
              history clock, ≥44px touch targets). Desktop: the floating panel
              header with menu, dock toggle and close. */}
          {isMobile ? (
            <div className="flex items-center gap-2 border-b border-border/60 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label={t("agent.close")}
                className="size-11"
              >
                <XIcon className="size-5" />
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMenuTab("chat");
                  setAgentMenuOpen((v) => !v);
                }}
                className="flex flex-1 items-center gap-1 text-base font-semibold"
              >
                <BotIcon className="size-5 shrink-0 text-primary" />
                <span className="truncate">{t("agent.title")}</span>
                <ChevronDownIcon
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    agentMenuOpen && "rotate-180",
                  )}
                />
              </button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setMenuTab("tasks");
                  setAgentMenuOpen((v) => !v);
                }}
                aria-label={t("agent.tabTasks")}
                className="size-11"
              >
                <ClockIcon className="size-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setAgentMenuOpen((v) => !v)}
                className="flex items-center gap-1 text-sm font-semibold"
              >
                <BotIcon className="size-5 text-primary" />
                {t("agent.title")}
                <ChevronDownIcon
                  className={cn(
                    "size-4 transition-transform",
                    agentMenuOpen && "rotate-180",
                  )}
                />
              </button>
              <div className="flex-1" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="icon-sm" variant="ghost" aria-label="menu">
                      <MoreHorizontalIcon />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={startNew}
                    disabled={create.isPending}
                  >
                    {t("agent.newConversation")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => toast.info(t("agent.manage"))}
                  >
                    {t("agent.manage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDocked(false)}>
                    {t("agent.restoreSize")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setDocked((v) => !v)}
                aria-label={t("agent.dockToggle")}
                title={t("agent.dockToggle")}
              >
                <PanelRightIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label={t("agent.close")}
              >
                <XIcon />
              </Button>
            </div>
          )}

          {/* Agent ∨ dropdown card */}
          {agentMenuOpen && (
            <div
              data-agent-menu
              className={cn(
                "absolute left-4 z-50 w-full max-w-[calc(100%-2rem)] rounded-xl border border-border/60 bg-popover p-2 shadow-xl",
                isMobile
                  ? "top-[calc(env(safe-area-inset-top)+3.25rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
                  : "top-14",
              )}
            >
              <div className="mb-2 flex rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setMenuTab("chat")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-sm",
                    menuTab === "chat"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t("agent.tabChat")}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuTab("tasks")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-sm",
                    menuTab === "tasks"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t("agent.tabTasks")}
                </button>
              </div>
              {menuTab === "chat" ? (
                <div className="max-h-60 overflow-y-auto">
                  {(conversations.data?.conversations ?? []).filter(
                    (c) => !/^async smoke/i.test(c.title),
                  ).length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {t("agent.noHistory")}
                    </div>
                  ) : (
                    (conversations.data?.conversations ?? [])
                      .filter((c) => !/^async smoke/i.test(c.title))
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setActiveId(c.id);
                            setAgentMenuOpen(false);
                          }}
                          className="block w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          {c.title}
                        </button>
                      ))
                  )}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("agent.tasksEmpty")}
                </div>
              )}
            </div>
          )}

          {/* Chat body */}
          <ChatScroll
            activeId={activeId}
            messages={messages.data?.messages}
            loading={messages.isLoading}
            sources={sources}
            awaitingReply={awaitingReply}
          />

          {/* Composer */}
          <div
            data-agent-composer
            className={cn(
              "border-t border-border/60",
              isMobile
                ? "p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
                : "p-3",
            )}
          >
            <Composer
              isMobile={isMobile}
              activeId={activeId}
              onSent={() => setAwaitingReply(true)}
              onCreated={(id) =>
                qc.invalidateQueries({ queryKey: queryKeys.agent.messages(id) })
              }
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t("agent.disclaimer")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ChatScroll({
  activeId,
  messages,
  loading,
  sources,
  awaitingReply,
}: {
  activeId: string | null;
  messages?: AgentChatMessage[];
  loading: boolean;
  sources: Record<string, string[]>;
  awaitingReply: boolean;
}) {
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, activeId]);

  if (!activeId) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <SparklesIcon className="size-5" />
          {t("agent.greeting")}
        </EmptyHeader>
        <EmptyDescription>{t("agent.greetingHint")}</EmptyDescription>
      </Empty>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }
  if (!messages || messages.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>{t("agent.startConversation")}</EmptyHeader>
        <EmptyDescription>{t("agent.startHint")}</EmptyDescription>
      </Empty>
    );
  }
  return (
    <div
      data-agent-scroll
      className="flex-1 space-y-3 overflow-y-auto overscroll-behavior-contain px-4 py-4"
    >
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} sources={sources[m.id]} />
      ))}
      {messages.at(-1)?.role === "user" && (
        <AgentPendingBubble slow={!awaitingReply} />
      )}
      <div ref={endRef} />
    </div>
  );
}

export function MessageBubble({
  message,
  sources,
}: {
  message: AgentChatMessage;
  sources?: string[];
}) {
  const { t } = useI18n();
  const isUser = message.role === "user";
  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl border border-border/50 p-3 text-sm shadow-xs",
          isUser
            ? "border-primary/30 bg-primary/10 text-foreground"
            : "bg-card/50",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <LazyMemoContent
            className="break-words text-sm leading-6"
            content={message.content}
          />
        )}
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
            <span className="mr-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <BookOpenTextIcon className="size-3" />
              {t("agent.sources")}
            </span>
            {sources.map((id) => (
              <Link
                key={id}
                to="/memo/$memoId"
                params={{ memoId: id }}
                className="rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[11px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {id.split("/").pop()!.slice(0, 8)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  activeId,
  onCreated,
  onSent,
  isMobile,
}: {
  activeId: string | null;
  onCreated: (id: string) => void;
  onSent: () => void;
  isMobile: boolean;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: ({
      content,
      retry,
      skill,
    }: {
      content: string;
      retry?: boolean;
      skill?: AgentSkillId;
    }) => sendMessage(activeId!, content, { retry, skill }),
    onMutate: async ({ content, retry }) => {
      // 乐观追加的同时立刻进入等待态：否则「最后一条是 user」先成立而 awaitingReply 还没置真，
      // 气泡会先闪一下降级文案再变三点（规格 13.6 要求三点即时可见）。
      onSent();
      await qc.cancelQueries({
        queryKey: queryKeys.agent.messages(activeId!),
      });
      const queryKey = queryKeys.agent.messages(activeId!);
      const prev = qc.getQueryData<{ messages: AgentChatMessage[] }>(queryKey);
      if (!retry) {
        // Optimistically append the user message so it renders instantly;
        // the POST refetch will reconcile (dedupe handled by real fetch).
        const optimistic: AgentChatMessage = {
          id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conversationId: activeId!,
          userId: "",
          role: "user",
          content,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData<{ messages: AgentChatMessage[] }>(queryKey, (old) => ({
          messages: [...(old?.messages ?? []), optimistic],
        }));
      }
      return { prev, queryKey };
    },
    onSuccess: (
      _data,
      _vars,
      ctx: { prev?: { messages: AgentChatMessage[] }; queryKey: unknown },
    ) => {
      setDraft("");
      setSendError(null);
      onSent();
      // Reconcile: refetch the server list (real ids) — placeholderData keeps
      // the optimistic row visible until the authoritative fetch returns.
      if (ctx?.queryKey) {
        qc.invalidateQueries({ queryKey: ctx.queryKey as string[] });
      }
      onCreated(activeId!);
    },
    onError: (error: unknown, _vars, ctx) => {
      // Roll back the optimistic insert on failure.
      if (ctx?.prev) {
        qc.setQueryData(ctx.queryKey as string[], ctx.prev);
      }
      const msg =
        error instanceof ApiError ? error.message : t("agent.sendFailed");
      setSendError(msg);
      toast.error(msg);
    },
  });

  const submit = () => {
    const content = draft.trim();
    if (!content || !activeId) return;
    setSendError(null);
    send.mutate({ content, retry: false });
  };

  const retry = () => {
    const content = draft.trim();
    if (!content || !activeId) return;
    setSendError(null);
    send.mutate({ content, retry: true });
  };

  if (!activeId) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-3 text-center text-sm text-muted-foreground">
        <PlusIcon className="mx-auto mb-1 size-4" />
        {t("agent.pickConversation")}
      </div>
    );
  }

  const canSend = !!draft.trim() && !send.isPending;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 transition-shadow focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/40">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={t("agent.placeholder")}
        className="min-h-9 resize-none border-0 bg-transparent px-3 pt-2.5 shadow-none focus-visible:ring-0"
        autoFocus
      />
      {/* Toolbar row: @mention, skills, image (flomo-style). Skills are live
          (the menu sends the skill name plus its id); image attach is a P4 scaffold. */}
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            isMobile && "size-11",
          )}
          aria-label={t("agent.mention")}
          title={t("agent.mention")}
        >
          <AtSignIcon className="size-4" strokeWidth={1.5} />
        </Button>
        <AgentSkillsMenu
          isMobile={isMobile}
          disabled={send.isPending}
          onSelect={(skill) => {
            setSendError(null);
            send.mutate({
              content: t(AGENT_SKILL_KEYS[skill.id].label),
              retry: false,
              skill: skill.id,
            });
          }}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            isMobile && "size-11",
          )}
          aria-label={t("agent.attachImage")}
          title={t("agent.attachImage")}
        >
          <ImageIcon className="size-4" strokeWidth={1.5} />
        </Button>
        <div className="flex-1" />
        {/* Failed state: red hint + green retry (flomo style). */}
        {sendError && (
          <div className="flex items-center gap-2 px-2 pb-1 text-xs">
            <span className="text-destructive">{sendError}</span>
            <Button
              size="icon-sm"
              variant="default"
              className={cn(
                "bg-emerald-500 text-white hover:bg-emerald-600",
                isMobile && "size-11",
              )}
              onClick={retry}
              aria-label={t("agent.retry")}
            >
              <RefreshCwIcon className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        )}
        {/* In-box circular up-arrow send button.
            flomo: grey when empty, green-filled with white arrow once there's text. */}
        <Button
          size="icon"
          variant={canSend ? "default" : "secondary"}
          className={cn(
            "size-8 rounded-full",
            isMobile && "size-11",
            canSend
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-muted text-muted-foreground hover:bg-muted",
          )}
          disabled={!canSend}
          onClick={submit}
          aria-label={t("agent.send")}
        >
          <ArrowUpIcon className="size-4" strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  );
}
