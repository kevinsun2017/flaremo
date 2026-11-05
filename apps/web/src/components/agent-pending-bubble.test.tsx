// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { AgentPendingBubble } from "./agent-pending-bubble";

describe("AgentPendingBubble", () => {
  it("shows three dots and an accessible label while fast-waiting", () => {
    const html = renderToStaticMarkup(<AgentPendingBubble />);
    expect(html).toContain("agent.pending");
    expect((html.match(/animate-bounce/g) ?? []).length).toBe(3);
    // 快等阶段不该出现降级文案
    expect(html).not.toContain("agent.stillProcessing");
  });

  it("degrades to 'still processing' instead of vanishing after the 60s poll bound", () => {
    const html = renderToStaticMarkup(<AgentPendingBubble slow />);
    expect(html).toContain("agent.stillProcessing");
    expect(html).not.toContain("animate-bounce");
    expect(html).toContain('role="status"');
  });
});
