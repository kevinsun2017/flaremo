# 编辑框所见即所得：P3 收口计划（实况盘点）

> 状态：**收尾完成**（2026-09-17 第二轮，分支 `feat/wysiwyg-p3-closing`）。前置条件（原稿 §3.5 的顺序依赖）已解除：voice §5 已作为 `b6647e8` 提交、feat/composer-wysiwyg 已由 Kim 合入 main。本轮交付：e2e 四 spec 适配、往返幂等单测落地（21 用例）、RTL 逻辑属性修正；随车修 main 既有问题（api.test.ts `kind` 期望 ×5、vitest 误扫 exclude、`@` 别名）。验收：tsc -b ✅、build ✅、全量 vitest 536/536 ✅、Playwright 未跑（待 Kim 指令）。已合 main 并推送（0eeb329）。（**后续已闭环（2026-09-17）**：format/lint 债已由 `40a3f73` 清除，kosx 已随 `bf7dad9` 滚动部署；issue #133 已回复并关闭。剩：阿语 dev 目检（建议真机过一遍）。）
> 阻塞发现（09-17）：main 上 voice P2-P4 文件未过 format（2 个 biome error + 41 warning，capture-page.tsx hooks 依赖、encoder.test 非空断言），`pnpm format` 会波及 13 个无关文件——kosx 部署门禁「format 先过」会挂，需 voice 会话或单独 format 提交先清债。（**已解决**：`40a3f73` 清除全部 format/lint 债。）
> 触发：GitHub issue #133（「正文增加加粗/下划线/斜体或 md 格式支持」）。核实结论：该 issue 的需求已被本分支实现覆盖，无需新方案；本文档回答「距离合并上线还差什么」。
> D1/D2 已由 Kim 于 2026-09-17 拍板：**全部按推荐执行**——D1 不做 Markdown 源码切换；D2 保留底部单行按钮位，不做浮动气泡菜单；下划线不做（无 Markdown 表示，落库即失样式）。三项与分支现状一致，无需改代码。

## 1. 实况总览

- 分支 `feat/composer-wysiwyg`（worktree `~/code/fm/FlareMo-wysiwyg`）：原 6 个提交**已于 2026-09-17 由并行会话 rebase 到 main（`6f754aa`）之上**，rebase 冲突实况与 §3.1 预演一致（仅 `memo-card.tsx`），并随车把 pcm 30 分钟用例超时上限 30s→60s。
- 原 P0/P1/P2 分期**全部落地**，且有四项超出原稿：包体分割（TipTap 拆 async chunk，主包 gzip 166KB 回基线，编辑器 chunk 141KB）、卡片行内编辑迁移同一编辑器（Cmd+Enter 保存/Esc 取消，明文 Enter 不提交）、粘贴/拖拽上传占位 chip、随车修复「缺 Image 节点致粘贴图静默丢失」的 bug。真机走查通过，107 测试绿（截至 P2 提交；rebase 后待重跑定向测试复核）。
- 工作区状态：`FlareMo-wysiwyg` worktree **干净**；主检出 `~/code/fm/FlareMo`（main）**有未提交改动**，属并行 voice rollout §5 会话（mediaSession、角色感知文案、webmanifest、i18n +4 key、`capture-page.tsx`、`wrangler.jsonc.example`），**不是本任务的，不动它**。

## 2. 关键实现事实（逐项核实过）

- 编辑器本体 `rich-composer-editor.tsx`：StarterKit 白名单（heading 1–3、`underline: false` 显式关、link 不外跳）+ TaskList/TaskItem + inline Image + Placeholder + 官方 Markdown + 两个自定义扩展。
- `#标签` 高亮走 **Decoration**（`tag-highlight-extension.ts`），不走 mark——杜绝序列化污染正文；点击跳标签页逻辑在 `lib/tag-highlight.ts`。
- 上传占位走 **Decoration**（`upload-placeholder-extension.ts`，不进文档模型）；上传编排在 `lib/rich-editor-upload.ts` + `memo-composer.tsx` 的 `enqueueInlineUploads`（链式防交错，`preuploadedAttachmentNames` 随删除修剪）。
- 编辑框 DOM id 仍是 `#flaremo-composer-input`（load-bearing：全局 "c" 快捷键、PWA 聚焦、e2e 选择器），卡片编辑器用 `article` 内独立 id。
- Enter 定调（真机走查收敛版）：列表项内 Enter 续写新条目；非列表 Enter 发送；Cmd/Ctrl+Enter 任何位置发送；IME 组合期（keyCode 229）一律不提交。
- draft 管道：`editor.getMarkdown()` ↔ `draft.content`，上游恢复仅在 markdown 与 `lastEmittedRef` 不一致时 re-parse，防自环。

## 3. 剩余工作：P3 收口清单（按执行顺序）

### 3.1 rebase 到 main（✅ 已由并行会话完成）

- 预演过 merge-tree：**唯一冲突文件 `apps/web/src/components/memo-card.tsx`**，实况与预演一致；i18n 八文件、`capture-page.tsx`、`pnpm-lock.yaml` 自动合并。此步已无剩余工作。

### 3.2 e2e 用例适配（✅ 完成：attachment-inline / memo-flow / workspace-flow / space-flow 四个 spec）

编辑器从 `<textarea>` 变为 ProseMirror `contenteditable`（同 id），受影响点（均已改）：

- `attachment-inline.spec.ts`
  - composer 粘贴用例：`toHaveValue(/\/file\/attachments\//)` 对 contenteditable **无效**（Playwright 的 toHaveValue 只支持 input/textarea/select）——改为断言 `textContent` 含附件引用；清空同理（contenteditable 无 value）。
  - 卡片行内编辑用例：`card.locator("textarea")` 定位失效——改为 `contenteditable` 定位（可沿用 `[contenteditable]` + card 作用域）。
- `workspace-flow.spec.ts`：`#flaremo-composer-input` 的 `.fill()` / `pressSequentially` 在 contenteditable 上可用（Playwright 支持），`toHaveValue` 断言需换——逐条核过再改。
- `memory-flow.spec.ts`：记忆弹窗的 `dialog.locator("textarea")` 已核实为 `memory-page.tsx` 独立 `<Textarea>`（非 memo composer），**不受影响，不用改**；capture 页与 voice 设置页同理。
- **Playwright 只在 Kim 明确要求时跑**；适配只改 spec 本身，跑不跑等 Kim 指令。

### 3.3 Markdown 往返抽样校验（✅ 落地为单测）

改为可回归的单测 `apps/web/src/components/composer-roundtrip.test.ts`（21 用例，`@vitest-environment jsdom`）：把编辑器扩展清单抽成 `buildComposerExtensions()` 工厂，测试与真实编辑器**共用同一份配置**；断言「二次序列化恒等」（首次可归一化，第二次不许变）+ 白名单语义抽样 + `<u>` 不复活/不产 HTML。21 用例全绿。根 `vitest.config.ts` 顺带补 `@` 别名（此前测试链路解析不到 app 内部模块）。

### 3.4 RTL（✅ CSS 层修正完成）

发现编辑器与卡片渲染层共用一套**物理方向属性**（`pl-6`/`border-l-2`/`rounded-r-md`/`pr-3 pl-4`），阿语下列表缩进与引用边框停在物理左侧。已把 `.memo-markdown` 与 `.composer-*` 两段统一换逻辑属性（`ps-6`/`pe-3`/`ps-4`/`border-s-2`/`rounded-e-md`/`me-1`/`float-start`），LTR 下逐项等价、RTL 下自动翻转；任务列表 checkbox 用 flex 排列，天然跟随 dir。**真机阿语目检仍建议合并后过一遍**（本轮未起 dev 走查）。

### 3.5 合并 main（✅ 前置已解除）

- 原「主检出脏 i18n」硬约束已解除：voice §5 已作为 `b6647e8` 提交入 main，Kim 已手动合入 feat/composer-wysiwyg（线性历史，main = `f87b339`）。
- 本轮（feat/wysiwyg-p3-closing）完成后合回 main 并推送。

### 3.6 验收与上线

- 验收口径（既定敏捷节奏）：`tsc` + 定向 vitest + `pnpm build` + dev 目检。
- 上线：kosx 滚一版（部署脚本在 flaremo-cloud 仓）；门禁不主动跑。
- 收尾：issue #133 回复「编辑器已支持所见即所得（加粗/斜体/任务列表/标签高亮等，Markdown 存储不变）；下划线因 Markdown 无对应语法暂不提供」并关闭。

## 4. 不做清单（本期定案）

- 下划线（D 定案：无 Markdown 表示，`<u>` 存储会破「纯文本存储」红线）。
- Markdown 源码切换开关（D1）：存储即 markdown，天然兜底。
- 浮动气泡菜单（D2）：底部单行按钮位保持。
- 表格入口、嵌套块、slash 面板（原稿 §5 既定）。
- 卡片渲染层更换：react-markdown + remark-gfm 留任。
