# 编辑器所见即所得改造（选型决策稿）

> 状态：**P0–P3 全部收尾完毕，已合 main**（2026-09-17，Kim 手动合入；issue #133 由本改造关闭：加粗/斜体/任务列表/标签高亮即敲即成形，下划线不做，HTML 手写不做）。收尾交付（分支 `feat/wysiwyg-p3-closing`）：① e2e 四 spec 适配 contenteditable（`toHaveValue`→`toHaveText`/img 断言，卡片编辑器用 `#flaremo-card-editor-input`）；② **Markdown 往返幂等单测** `composer-roundtrip.test.ts` 21 用例（扩展清单抽成 `buildComposerExtensions()` 工厂与真实编辑器共用，二次序列化恒等 + `<u>` 不复活）；③ RTL 修正：`.memo-markdown` 与 `.composer-*` 物理方向属性换逻辑属性（LTR 等价、RTL 翻转），阿语真机目检建议合并后过一遍；④ 随车修 main 既有问题：api.test.ts 补 voice P2 新增的 `kind` 字段期望（4 用例）、根 vitest exclude 排除 Playwright spec 与 node:test 脚本、补 `@` 别名。包体：编辑器 chunk ~171KB raw / 56KB gzip，主包不增。验收：tsc -b ✅ / build ✅ / 定向与全量 vitest ✅（Playwright 未跑，待 Kim 指令）。
> 原决策记录（2026-09-17 起草）：Kim 已定向两件事：① 编辑框补待办能力；② 弃「textarea 裸写 Markdown」，走 Bear 式所见即所得（路线 C）。本稿回答路线 C 的落地问题：**有没有成熟的第三方组件库**，选哪个。
> 原则约束：`docs/design-system.md`「简约不简单，克制不放肆」。
> 红线（不可谈判）：**memo 正文存储格式保持纯 Markdown 文本，一字不动**。Memos 兼容 API、MCP、agent 管道、导出导入全靠它；编辑器只是存储之上的渲染层。
> 动工前置：与并行会话收口工作区（voice-capture-rollout R1 同款约束）。

核心结论：**选 TipTap 3 + 官方 `@tiptap/markdown`**。决定性的新变量是 2025-10 起官方 Markdown 扩展随 v3.7.0 发布（现为 3.31.x，四天前仍在发版）：双向解析/序列化由官方维护，社区包 `tiptap-markdown` 已声明让位。它是唯一同时满足「Markdown 往返是主公民、中文 IME 一流、元素白名单完全可控、生态有现成任务列表」四条的方案。备选 Milkdown 7（Typora 风、remark 系）真实可用但定制都要落回 ProseMirror 层，等于多套一层抽象；其余候选（BlockNote / Lexical / Vditor / CodeMirror 自拼）各有硬伤，见 §4。

---

## 1. 背景与现状盘点

编辑框（`apps/web/src/components/memo-composer.tsx`）现状三宗罪：

1. **无待办能力**：插入按钮只有 `#` 标签、图片、无序列表（`- `）。没有 `- [ ] ` 入口。
2. **渲染层差最后一步**：`memo-content.tsx` 用 react-markdown + remark-gfm，GFM 任务列表能渲染成 checkbox（`index.css:438` 已配品牌色），但那是 disabled input——卡片里**不可点击勾选**，改状态要回编辑框改 markdown 文本。
3. **任务系统孤立**：后端有正经任务实体（`packages/domain/src/tasks.ts`，status/priority/dueAt/活动轨迹，挂在项目下），但与 memo 两个世界互不打通。

本稿解决 1+2 的「编辑与勾选体验」；3 的「memo↔task 联动」是后续独立决策，不在本稿范围（见 §7 D3）。

## 2. 目标与约束

| 目标 | 说明 |
|---|---|
| 所见即所得 | 打 `- ` 变真圆点；敲 `- [ ] ` 变可点击真 checkbox；`#标签` 高亮品牌色；引用/代码/表格即敲即成形 |
| 存储不变 | 进出编辑器都是标准 GFM 文本；旧 memo 无缝打开，旧客户端/API 零感知 |
| IME 安全 | Enter 发送 + IME 组合期不提交的既定定调必须原样保留 |
| 克制 | 只放行产品里真实存在的元素（见 §5 白名单）；不做嵌套块、不做 slash 面板、不做协作 |
| 兼容存量 | 粘贴/拖拽图片上传链路、草稿恢复、8 语言 i18n、RTL（阿语）、a11y 全部保住 |

## 3. 候选全景

npm 活跃度核实于 2026-09-17：

| 库 | 最新版 | 最后发版 | 架构 | Markdown 往返 |
|---|---|---|---|---|
| **TipTap** | 3.31.3 | 2026-09-04 | ProseMirror + 自家扩展体系 | **官方** `@tiptap/markdown`（3.7.0 起） |
| Milkdown | 7.22.1 | 2026-08-12 | ProseMirror + remark，插件驱动 | 原生（ Typora 式，schema 即 markdown） |
| BlockNote | 0.54.2 | 2026-09-09 | TipTap 内核 + Notion 块 UI | 内置 import/export，JSON 块模型优先 |
| Lexical | 0.50.0 | 2026-09-16 | Meta 自研 DAG 模型 | `@lexical/markdown`，转义/细节有已知缺陷 |
| Vditor | 4.0.0 | 2026-08-30 | 自包含三模式组件（含即时渲染） | 原生，但整组件自带样式体系 |

另有一条非组件库路线：CodeMirror 6 自拼 Obsidian 式 live preview——不列为正式候选，理由见 §4.6。

## 4. 逐个评审

### 4.1 TipTap 3 —— 推荐

- **是什么**：ProseMirror 之上的扩展框架，React 绑定成熟（`@tiptap/react`），v3 于 2025-07 stable，现在是 3.x 高频发版期。
- **决定性优势**：
  - 官方 `@tiptap/markdown`：parse markdown ↔ serialize markdown，双向、开源、随主版本走。此前社区包 `tiptap-markdown` 的最大顾虑（第三方序列化器失真）自 3.7.0 起消除。
  - 任务列表是官方一等扩展（`@tiptap/extension-list` 的 TaskList/TaskItem），checkbox 天生可交互——§1 的第 1、2 宗罪一次根治。
  - ProseMirror 的 CJK IME 处理是所有编辑器框架里最扎实的，「Enter 发送 + IME 安全」直接沿用现有 keydown 策略。
  - 白名单式组装：StarterKit 起步，不需要的扩展（如横向规则、下划线）不装即可，天然契合「克制」。
  - 自定义节点成本可控：附件图（`flaremo://`）、`#标签` mark、时间戳链接各写一个 ProseMirror node/mark，社区范式成熟。
- **代价**：包体增量最大（预估 gzip +150–250KB，P1 实测为准）；自定义节点仍在 ProseMirror 层写代码，不是纯配置。

### 4.2 Milkdown 7 —— 真实备选，不选

- **是什么**：ProseMirror + remark，Typora 式所见即所得，插件驱动，天生 markdown-first。
- **为何仍不选**：它的「开箱」最接近理想形态，但 FlareMo 需要的三个定制（附件节点带上传占位、标签 mark 点跳、时间戳 seek）全部要写 ProseMirror 插件——在 Milkdown 里写和在 TipTap 里写是同一层工作，却多套了它自己的插件抽象；出问题时调试链路更长。适合「要素食即用」的团队，我们是深度定制型，抽象层是负债。
- 保留观察：若 P1 骨架期发现 TipTap 白名单组装成本超预期，可回头切 Milkdown，两者底层同为 ProseMirror，资产不浪费。

### 4.3 BlockNote —— 不选

Notion 式块 UI（slash 菜单、拖拽手柄、块级 hover 控件），审美和交互密度与「克制不放肆」直接冲突；JSON 块模型优先、markdown 是出入口转换，往返保真度天然弱于 markdown-first 方案；我们不需要协作与块数据库，重量全是浪费。

### 4.4 Lexical —— 不选

Meta 亲自维护、最活跃（0.50.0，前一天刚发版），但 markdown 是二等公民：`@lexical/markdown` 的转义处理有长期未决缺陷，markdown shortcut 可定制性差，任务列表、图片上传链都要自建。选它等于用最活跃的框架手工补最多的洞。

### 4.5 Vditor —— 不选

功能最全（编辑/即时渲染/分屏三模式），但它是「自带完整皮肤和交互体系的整件家电」：样式、工具栏、提示文案自成一套，与品牌 token（`--brand` 色阶、`memo-markdown` 排印）整合基本靠覆盖 hack；React 集成为胶水层；包体最重。个人工具博客常见，产品级集成的维护成本高。

### 4.6 CodeMirror 6 自拼 live preview —— 不选

Obsidian 路线：源码模式下 inline 渲染加粗/标签等。能做，但「部分符号仍可见」意味着问题只解决一半，且没有现成 React 组件，等于自研编辑器——投入产出比最差的一条路。

## 5. 推荐：TipTap 3 组装清单与元素白名单

依赖（P0 落地）：

```
@tiptap/react @tiptap/starter-kit @tiptap/markdown
@tiptap/extension-list        # TaskList / TaskItem
@tiptap/extension-image       # 改造成 flaremo:// 附件节点的基础
@tiptap/extension-placeholder
```

元素白名单（= 现有 GFM 渲染面 + 标签，无新增块类型）：

| 元素 | 来源 | 备注 |
|---|---|---|
| 标题 h1–h3 | StarterKit | 卡片已有排印，编辑态对齐 |
| 有序/无序列表 | StarterKit | 现有「列表」按钮平移 |
| **任务列表 `- [ ]`** | extension-list | checkbox 可交互；编辑态勾选 = 改文档状态 |
| 引用 / 行内代码 / 代码块 / 分隔线 | StarterKit | 即敲即成形 |
| 表格 | 暂缓（P3 后独立决策） | 有排印无入口，先不放开 |
| 图片（flaremo:// 附件） | 自定义 node | 承接现有粘贴/拖拽上传链，支持上传中占位 |
| `#标签` mark | 自定义 | 品牌色高亮 + 点击跳标签页 |
| 时间戳链接 | 自定义 inline | 承接 `lib/transcript.ts` 的 `#flaremo-t=` 语义 |

明确不做（本期）：嵌套块、slash 命令面板、协作/OT、markdown 源码切换开关（见 §7 D1）。

## 6. 分期落地

| 期 | 主题 | 内容 | 依赖 |
|---|---|---|---|
| P0 | 依赖与骨架 | 装依赖；`RichtextComposer` 新组件：StarterKit 白名单 + TaskList + `@tiptap/markdown`；与 draft 管道（`MemoCaptureInput`）接线：`editor.getMarkdown()` ↔ `draft.content`；Enter/IME/Cmd+Enter 发送策略平移；高度自适应（现 useLayoutEffect 逻辑平移） | 无 |
| P1 | 体验补齐 | placeholder、底部按钮迁移（`#` 标签=插 tag mark、图片=现有上传链、可见性/发送不动）；草稿恢复回归；RTL 检查；包体实测记录 | P0 |
| P2 | 三个自定义节点 | 附件图节点（上传占位/失败占位/死链占位，对齐 `MarkdownImage` 行为）、标签 mark、时间戳链接 | P1 |
| P3 | 收尾退役 | 卡片渲染不动（react-markdown 留任）；旧 Textarea 路径删除；定向测试补齐；与 voice-capture-rollout 的 composer 交叠文件核对 | P2 |

验收口径（全期统一，按既定敏捷节奏）：`tsc` + 定向 vitest + `pnpm build` + dev 目检；**Playwright 仅在 Kim 明确要求时跑**。

## 7. 开放决策点

| # | 问题 | 推荐 | 状态 |
|---|---|---|---|
| D1 | 是否保留「markdown 源码切换」给高级用户 | 暂不做；存储是 markdown 本身已是兜底 | 已拍板（09-17）：不做 |
| D2 | 工具栏形态 | 保留现有底部单行按钮位（克制），不做浮动气泡菜单 | 已拍板（09-17）：保留底部单行按钮位 |
| D3 | 时间线卡片内 checkbox 点击勾选 | 编辑框先行，卡片端联动涉及 memo 内容回写，另立决策 | 已落地（09-17）：卡片 checkbox 对编辑者可勾选；联动规格见 `projects-tasks-audit.md` D2 |
| D4 | 草稿兼容 | 草稿存的是 markdown 文本，新编辑器 parse 即可，无需迁移 | 默认 |

## 8. 风险清单

- **包体**：gzip 预估 +150–250KB；P1 实测，超预期则评估 StarterKit 按需拆装。
- **并行会话**：composer/`memo-composer.tsx` 与 voice-capture P3 文件有交叠，动工前必须收口工作区（同 R1 约定）。
- **RTL**：ProseMirror 原生支持 dir，但 TaskItem/标签 mark 的方向性样式要真机过阿语。
- **Markdown 往返保真**：官方序列化对非常规写法（手写 HTML 已被 skipHtml 挡住；深层嵌套引用）可能有归一化行为，P1 用真实存量 memo 抽样做 round-trip 校验。
- **回归面**：粘贴/拖拽上传链（`image-insert.ts` 的光标插入逻辑被节点插入替代）、草稿恢复、i18n 键（8 语言 + TranslationKey 强制对齐）逐项过。

## 9. 结论

第三方成熟组件库这条问题的答案是：**有，就是 TipTap 3 官方家族**——2025-10 起它把 Markdown 往返收编为官方能力，补上了此前选它的最后一块短板；不需要在成熟度上退而求其次去找「更整件」的方案，因为整件方案（Vditor/BlockNote）的集成成本反而更高。路线 C 的判断不变，执行载体定为 TipTap 3。
