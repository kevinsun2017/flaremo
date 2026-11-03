import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookOpenTextIcon,
  BotIcon,
  CornerDownLeftIcon,
  MessageSquarePlusIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
  type AgentChatMessage,
  type AgentConversation,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { useI18n } from "@/i18n";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * flomo-style Agent chat: a read-everything persona that answers from your
 * own memos. Left rail = conversations; main column = message bubbles + a
 * grounded composer. Every assistant reply surfaces the memo ids the LLM was
 * grounded on (sources), linking straight back to the sourced records.
 */
export function AgentChatPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  // assistant message id -> memo ids it was grounded on (from the POST reply).
  // Not persisted server-side yet: source persistence needs a worker migration
  // (sources live on the POST response, not in agent_chat_messages).
  const [sources, setSources] = useState<Record<string, string[]>>({});

  const conversations = useQuery({
    queryKey: queryKeys.agent.conversations,
    queryFn: listConversations,
  });

  const messages = useQuery({
    queryKey: queryKeys.agent.messages(activeId ?? ""),
    queryFn: () => listMessages(activeId!),
    enabled: !!activeId,
  });

  const create = useMutation({
    mutationFn: createConversation,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.agent.conversations });
      setActiveId(data.conversation.id);
    },
    onError: () => toast.error(t("agent.createFailed")),
  });

  return (
    <WorkspaceLayout
      header={({ ...props }) => (
        <WorkspacePageHeader
          icon={<BotIcon />}
          title={t("nav.agent")}
          actions={
            <Button
              size="sm"
              variant="default"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              <PlusIcon />
              {t("agent.newConversation")}
            </Button>
          }
          {...props}
        />
      )}
    >
      <div className="flex h-full min-h-0 gap-4">
        {/* Conversation rail */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border/50 md:flex">
          <ConversationList
            conversations={conversations.data?.conversations}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </aside>

        {/* Chat column */}
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <ChatScroll
            activeId={activeId}
            messages={messages.data?.messages}
            loading={messages.isLoading}
            sources={sources}
          />
          <Composer
            activeId={activeId}
            onCreated={(id) =>
              qc.invalidateQueries({ queryKey: queryKeys.agent.messages(id) })
            }
            onSources={(msgId, ids) =>
              setSources((prev) => ({ ...prev, [msgId]: ids }))
            }
          />
        </section>
      </div>
    </WorkspaceLayout>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations?: AgentConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!conversations || conversations.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        {t("agent.emptyConversations")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            className={cn(
              "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
              c.id === activeId
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            onClick={() => onSelect(c.id)}
            title={c.title}
          >
            {c.title}
          </button>
        </li>
      ))}
    </ul>
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
      <div className="flex flex-1 flex-col gap-3">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-24 w-3/4" />
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
  endRef.current?.scrollIntoView({ block: "nearest" });
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
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
            <span className="mr-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
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
  onSources,
}: {
  activeId: string | null;
  onCreated: (id: string) => void;
  onSources: (messageId: string, sourceIds: string[]) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const send = useMutation({
    mutationFn: (content: string) => sendMessage(activeId!, content),
    onSuccess: (data) => {
      setDraft("");
      onSources(data.message.id, data.sources);
      qc.invalidateQueries({
        queryKey: queryKeys.agent.messages(activeId!),
      });
      onCreated(activeId!);
    },
    onError: () => toast.error(t("agent.sendFailed")),
  });

  const submit = () => {
    const content = draft.trim();
    if (!content || !activeId || send.isPending) return;
    send.mutate(content);
  };

  if (!activeId) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
        <MessageSquarePlusIcon className="mx-auto mb-1 size-4" />
        {t("agent.pickConversation")}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-2">
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
        className="min-h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
        autoFocus
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={!!activeId && send.isPending}
          onClick={submit}
        >
          <CornerDownLeftIcon />
          {t("agent.send")}
        </Button>
      </div>
    </div>
  );
}