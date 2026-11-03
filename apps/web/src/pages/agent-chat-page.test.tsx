// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children?: unknown;
    className?: string;
  }) => {
    const href = params ? `/${params.memoId ?? ""}` : to;
    return (
      // eslint-disable-next-line jsx-a11y/anchor-is-valid
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

import { MessageBubble, type AgentChatMessage } from "./agent-chat-page";

function makeMessage(over: Partial<AgentChatMessage>): AgentChatMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    userId: "u-1",
    role: "assistant",
    content: "你好",
    createdAt: "2026-11-03T00:00:00.000Z",
    ...over,
  };
}

describe("AgentChatPage MessageBubble", () => {
  it("renders an assistant answer", () => {
    const html = renderToStaticMarkup(
      <MessageBubble message={makeMessage({})} />,
    );
    expect(html).toContain("你好");
  });

  it("shows no source row when no sources are attached", () => {
    const html = renderToStaticMarkup(
      <MessageBubble message={makeMessage({})} />,
    );
    expect(html).not.toContain("agent.sources");
    expect(html).not.toContain("memos/");
  });

  it("shows each source as a link back to the memo", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({})}
        sources={["memos/11111111-aaaa", "memos/22222222-bbbb"]}
      />,
    );
    expect(html).toContain("agent.sources");
    expect(html).toContain("memos/11111111-aaaa");
    expect(html).toContain("memos/22222222-bbbb");
    // Each source renders as one anchor element.
    expect((html.match(/<a[ >]/g) ?? [])).toHaveLength(2);
  });

  it("does not render sources for a user bubble", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={makeMessage({ role: "user", content: "问题" })}
        sources={["memos/11111111-aaaa"]}
      />,
    );
    expect(html).toContain("问题");
    expect(html).not.toContain("agent.sources");
  });
});