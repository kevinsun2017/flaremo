import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  AtSignIcon,
  BookOpenTextIcon,
  BotIcon,
  ImageIcon,
  MessageSquarePlusIcon,
  PanelRightIcon,
  PlusIcon,
  PuzzleIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
  type AgentChatMessage,
} from "@/api";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("flaremo:open-agent", handler);
    return () => window.removeEventListener("flaremo:open-agent", handler);
  }, []);
  const [activeTab, setActiveTab] = useState<"chat" | "tasks">("chat");
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

  const conversations = useQuery({
    queryKey: queryKeys.agent.conversations,
    queryFn: listConversations,
  });

  const messages = useQuery({
    queryKey: queryKeys.agent.messages(activeId ?? ""),
    queryFn: () => listMessages(activeId!),
    enabled: !!activeId,
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
      if (panelRef.current && !panelRef.current.contains(target) && !bubble?.contains(target)) {
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
            docked
              ? "fixed right-0 top-0 h-svh w-[380px] max-w-[calc(100vw-3rem)] rounded-none border-r-0"
              : "fixed bottom-20 right-6 h-[560px] w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <BotIcon className="size-5 text-primary" />
            <span className="flex-1 truncate text-sm font-semibold">
              {t("agent.title")}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={create.isPending}
              onClick={startNew}
              aria-label={t("agent.newConversation")}
            >
              <MessageSquarePlusIcon />
            </Button>
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

          {/* Tabs: 对话 / 定时任务 */}
          <div className="flex border-b border-border/60">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium",
                activeTab === "chat"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground",
              )}
            >
              {t("agent.tabChat")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium",
                activeTab === "tasks"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground",
              )}
            >
              {t("agent.tabTasks")}
            </button>
          </div>

          {/* Chat body */}
          {activeTab === "chat" && (
            <ChatScroll
              activeId={activeId}
              messages={messages.data?.messages}
              loading={messages.isLoading}
              sources={sources}
            />
          )}

          {/* Composer */}
          {activeTab === "chat" && (
          <div className="border-t border-border/60 p-3">
            <Composer
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
          )}

          {activeTab === "tasks" && (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t("agent.tasksEmpty")}
            </div>
          )}
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
}: {
  activeId: string | null;
  messages?: AgentChatMessage[];
  loading: boolean;
  sources: Record<string, string[]>;
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
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} sources={sources[m.id]} />
      ))}
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
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl border border-border/50 p-3 text-sm shadow-xs",
          isUser
            ? "border-primary/30 bg-primary/10 text-foreground"
            : "bg-card/50",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
}: {
  activeId: string | null;
  onCreated: (id: string) => void;
  onSent: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: ({ content, retry }: { content: string; retry?: boolean }) =>
      sendMessage(activeId!, content, { retry }),
    onSuccess: () => {
      setDraft("");
      setSendError(null);
      onSent();
      // 用户消息已发出，立即刷新列表显示用户消息；assistant 由后台生成，轮询获取
      qc.invalidateQueries({ queryKey: queryKeys.agent.messages(activeId!) });
      onCreated(activeId!);
    },
    onError: (error: unknown) => {
      const msg = error instanceof ApiError ? error.message : t("agent.sendFailed");
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
      {/* Toolbar row: @mention, skills, image (flomo-style); image/skills are
          P4 scaffolds — submitting is still text-only. */}
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("agent.mention")}
          title={t("agent.mention")}
        >
          <AtSignIcon className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("agent.skills")}
          title={t("agent.skills")}
        >
          <PuzzleIcon className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
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
              className="bg-emerald-500 text-white hover:bg-emerald-600"
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