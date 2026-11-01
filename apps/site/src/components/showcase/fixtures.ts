import type { ShowcaseContent } from "@/content/showcase-i18n";

/** 展示区单条笔记的假数据结构 */
export type Memo = {
  id: string;
  orderNumber: number;
  timeLabel: string;
  title: string;
  content: string;
  quote?: string;
  tags: string[];
  isNew?: boolean;
};

export const HEATMAP_TILES = Array.from({ length: 72 }, (_, i) => ({
  id: `tile-k-${i}`,
  isHigh: i >= 68,
  isMedium: i >= 64 && i < 68,
}));

/** 双端共用的三类视图菜单 */
export type ShowcaseMenu = "timeline" | "archive" | "trash";

/** 侧栏时间视图切换标签 */
export type TimeViewTab = "trend" | "calendar";

/** 双端硬件模型：桌面 MacBook / 手机 */
export type ShowcaseDevice = "desktop" | "mobile";

export type ShowcaseTag = ShowcaseContent["ui"]["tags"][number];

/** 初始值与语言切换时重置的两条笔记（文案随 i18n 走） */
export function createInitialMemos(showcase: ShowcaseContent): Memo[] {
  return [
    {
      id: "memo-65",
      orderNumber: 65,
      timeLabel: showcase.memo1.time,
      title: showcase.memo1.title,
      content: showcase.memo1.content,
      quote: showcase.memo1.quote,
      tags: showcase.memo1.tags,
    },
    {
      id: "memo-64",
      orderNumber: 64,
      timeLabel: showcase.memo2.time,
      title: showcase.memo2.title,
      content: showcase.memo2.content,
      tags: showcase.memo2.tags,
    },
  ];
}
