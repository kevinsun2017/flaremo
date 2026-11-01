# Base UI 迁移实施文档（官网 + 应用本体）· 执行版

> 状态：**已执行完毕（2026-09-15）**。批次 1（官网）commit `d7a8f0b`，批次 2（应用）commit `7b722cb`；官网已部署（flaremo-site version fe411966），kosx 已滚 `7b722cb`（version fc1602ed）。实际执行与文档的偏差记录在文末「附录 10：执行结果」。
> 调研基线：2026-09-15。所有 API 均以 `@base-ui/react@1.8.0` 源码（node_modules 类型声明 + 运行时代码）逐一核验，非仅凭官方文档；各表中的 props 均为实测存在项。
>
> 决策：趁快速开发期将两端底层 UI 组件从 `radix-ui` 迁至 `@base-ui/react`，并一次性接完 RTL/i18n 三根线；完成后 Radix 依赖清零、**禁止回增**（以 grep 为准）。

---

## 0. 执行者须知（先读）

- **仓库与部署**：仓库 `FlareMo`（开源主仓）。部署一律手动 `wrangler deploy`，无 CI/自动部署（不要新增）。
- **wrangler 配置陷阱**：根目录 `wrangler.json` 是给 Deploy 按钮用的零占位文件；一切 D1 类 wrangler 命令必须显式 `--config ./wrangler.jsonc`。官网部署：`cd apps/site && pnpm deploy`（内部 `build + wrangler deploy --config ./wrangler.jsonc`）。
- **门禁顺序**：`pnpm format`（biome，format 先过）→ `pnpm lint`（biome）→ `pnpm typecheck` → `pnpm test`（vitest）→ e2e（Playwright，`tests/e2e/`，14 个 spec 文件）。全绿才可部署。
- **并行会话**：同仓可能有其他会话在 commit/部署。开工前 `git status` + `git log --oneline -5` 确认基线；异动时先 `git reflog` 核对，**不要 stash/reset** 别人的提交。
- **提交**：一个批次一个 commit（或按文件组分小 commit），message 用 `refactor(ui)/feat(site)` 前缀。不要动 `wrangler.json`、不要碰 `.github/`。
- **版本钉子**：`@base-ui/react` 锁 `1.8.0`（`~1.8.0`）。开工前 `npm view @base-ui/react version` 核对是否有更高 minor，若升级需过一遍 [CHANGELOG](https://github.com/mui/base-ui/blob/main/CHANGELOG.md) 中的 breaking 条目再定。

---

## 1. 依赖与包名（已验证）

| 项 | 值 |
| --- | --- |
| 包名 | `@base-ui/react`（**不是** `@base-ui-components/react`，那是 1.0-rc 时代的旧名） |
| 版本 | `1.8.0`（2026-09-04） |
| 移除 | `radix-ui`（官网 `^1.6.7`、应用 `^1.6.0`） |
| 子路径导出 | 每个组件独立子路径：`@base-ui/react/menu`、`/dialog`、`/alert-dialog`、`/tooltip`、`/tabs`、`/slider`、`/switch`、`/toggle`、`/toggle-group`、`/collapsible`、`/progress`、`/direction-provider`、`/use-render`（已实测存在） |

## 2. 关键事实（调研结论，含验证途径）

### 2.1 无障碍

- 开箱：ARIA/角色/指针/键盘（WAI-ARIA APG）/焦点管理（`initialFocus`、`finalFocus`，含按交互类型回调）/表单关联（Form/Field/Fieldset）。
- **开发者责任**（官方文档明示）：`:focus-visible` 样式、颜色对比度（APCA）、自定义控件 accessible name。现有组件均已具备，迁移时逐项保留。
- 已知读屏边角（v1.8.0 时点）：Progress/Meter 在 NVDA/JAWS 不报标签（mui/base-ui#4184）、Slider+VoiceOver 报旧值（#5296）、Toast Undo 焦点（#4253）。均为边角且活跃跟进中；验收时读屏抽查以这些为已知豁免项。

### 2.2 多语言（三层结论）

1. **RTL 行为**：`DirectionProvider` + `useDirection`。源码核验消费方：menu、combobox、select、slider、scroll-area、navigation-menu、otp-field、composite（tabs/toolbar 底层）。**不写 HTML/CSS**——`dir` 属性、视觉镜像、字体、字距全是我们的活。
2. **读屏文案**：全库 grep 验证**零硬编码英文 ARIA 字符串**；所有 `aria-label` 由调用方传入 → 读屏语言天然跟随页面语言。
3. **数字/日期**：`Slider`/`NumberField` 有 `locale`/`format` props 走 Intl；无 I18nProvider/历法系统。应用目前仅 zh-CN/en-US，够用；若将来做阿语历法日期控件，单组件评估 React Aria，不动底座。

### 2.3 shadcn CLI

实测 `shadcn@4.12.0` 与 `latest` 的 `migrate --list`：只有 `cn / icons / base-color / radix / rtl` 五个迁移，**没有 radix→base 自动迁移**。本项目组件均已深度定制，采用手工映射（本文档 §4/§5 即完整依据），shadcn base 系列（base-nova）源码可作参考实现。

### 2.4 与我们代码形态的重要差异（重点！）

| 维度 | Radix 现状（我们代码） | Base UI 1.8.0（已验证） |
| --- | --- | --- |
| 组合 prop | `asChild` | `render={<el/>}`（hook：`useRender`） |
| Dialog 内容 | `Content` | `Popup`；`Overlay` → `Backdrop` |
| 弹层 CSS 变量 | `--radix-dropdown-menu-content-available-height`、`--radix-dropdown-menu-trigger-width`、`--radix-dropdown-menu-content-transform-origin` | **`--available-height`、`--anchor-width`、`--transform-origin`**（另 `--anchor-height`、`--available-width`、`--positioner-width/height`）。设置在 **Positioner** 元素上，子级 Popup 可通过 CSS 变量继承读取。应用 `dropdown-menu.tsx` 的 `max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) origin-(--radix-dropdown-menu-content-transform-origin)` 三个类**必须重写** |
| 状态 data 属性 | `data-state=open/checked`、`data-[state=delayed-open]` | `data-open`/`data-closed`/`data-checked`/`data-unchecked`/`data-highlighted`/`data-active`/`data-disabled`/`data-starting-style`/`data-ending-style`/`data-instant` |
| 动画 API | tw-animate-css 的 `animate-in/out` + data 选择器 | 同样可用；另有组件级 `startingStyle` prop（内联起始样式，可选） |
| 菜单高亮 | `data-highlighted` | 同名（`MenuItem` 源码核验：`data-highlighted`、`data-disabled`） |
| 回调签名 | `onOpenChange(open)` | `onOpenChange(open, eventDetails)`、`onValueChange(value, eventDetails)`——第二参多出，调用方通常无需消费，但**签名变了** |

利好：应用本体 dialog/sheet/dropdown-menu 的动画类**已经**在用 `data-open:`/`data-closed:`（shadcn radix-nova 新样式为 Base UI 兼容做了预埋），tabs 也在用 `data-active:`——这三类动画选择器基本零改动；需要重写的是：switch 的 `data-[state=checked]`、site dropdown 的 `data-[state=open]`、tooltip 的 `data-[state=delayed-open]`、memo-outline 的 `data-[state=open]`。

---

## 3. 端到端映射总表（Radix → Base UI，逐组件含我们实际用到的 props）

> 标 ✅ 的 = 我们代码在用且 Base UI 同名同义；标 🔄 = 语义相同但更名/换结构；标 ⚠️ = 行为差异需注意。

### 3.1 官网 `apps/site`

| 现文件 | 现用 | 目标 |
| --- | --- | --- |
| `ui/button.tsx` | `Slot.Root` + `asChild` | 🔄 `useRender({ defaultTagName: "button", props, render })`；对外 API `asChild` → `render`（5 处调用点：home-page ×4、site-nav ×1） |
| `ui/badge.tsx` | `Slot.Root` + `asChild` | 同上（无 asChild 调用点，API 面收敛） |
| `ui/dropdown-menu.tsx` | `DropdownMenu.*` | 🔄 `Menu`：见 §3.2 通用映射；Content = 封装内 `Portal > Positioner > Popup`；动画选择器 `data-[state=open]:animate-in…` → `data-open:` |
| `ui/progress.tsx` | `Progress.Root/Indicator` | 🔄 `Progress.Root + Track + Indicator`；**删除手写 `translateX`**（Base UI Indicator 内联 `width: N%`，源码核验），保留过渡类 `transition-[width]` |

调用点（`grep -n asChild apps/site/src` 复核）：home-page.tsx:172/179/767/773（`<Button asChild><a/></Button>`）、site-nav.tsx:326、locale-switcher.tsx:61 与 site-nav.tsx:137（`DropdownMenuTrigger asChild`）。

### 3.2 Menu（两端 dropdown-menu 的目标结构）

> ⚠️ 顺序以 `Portal > Positioner > Popup` 为准（包内 bundled 文档核验；下方简图为修正版，执行时已照此实现）。

```
Menu.Root(open / onOpenChange ✅ / defaultOpen ✅ / modal ✅)
└─ Menu.Trigger（原生 <button>，可直接传 className/children/aria-label；
     支持 render prop 与 nativeButton —— 源码核验。原 `asChild` 包自定义按钮的
     两处（locale-switcher / ThemeToggle）改为直接把 className/aria-label/
     children 给 Trigger，不再包一层）
   └─ Menu.Portal
      └─ Menu.Positioner(side ✅ / align ✅ / sideOffset ✅ / alignOffset ✅ / pinned ✅)
         ├─ Menu.Popup（动画容器；z-50/outline-none 样式在 Positioner 上兜底）
         │  └─ Menu.Item(closeOnClick ✅，默认 true) / Group / GroupLabel（⚠️ 必须包在
         │     Group 内，裸用抛 error #31）/ Separator ✅ /
         │     CheckboxItem(checked ✅ / onCheckedChange ✅) + CheckboxItemIndicator /
         │     RadioGroup(value ✅ / onValueChange ✅) / RadioItem + RadioItemIndicator
         └─ Menu.Arrow（若需要，放在 Positioner 内、Popup 外）
```

- ⚠️ `CheckboxItem`/`RadioItem` 的 `ItemIndicator`：Base UI 为 `CheckboxItemIndicator`/`RadioItemIndicator`，支持 `keepMounted`。
- ⚠️ Radix `Item.onSelect` → Base UI `Item.onClick` + `closeOnClick` 控制点击后是否收起（默认 true，即点选后收起菜单，与 Radix 语义一致）。
- 无 submenu 使用；Base UI 有 `SubmenuRoot/SubmenuTrigger`（结构 = SubmenuRoot 内含 SubmenuTrigger + 自己的 Portal>Positioner>Popup），应用 wrapper 已照此实现备用。

### 3.3 Dialog / AlertDialog / Sheet（应用本体）

| 我们现在的部分 | Base UI 部分 | 备注 |
| --- | --- | --- |
| `Dialog.Root`（open/onOpenChange） | `Dialog.Root`（open/onOpenChange ✅、defaultOpen ✅、`modal?: boolean \| 'trap-focus'` ✅） | 回调第二参 `eventDetails`，现有调用点无需改 |
| `DialogTrigger` / `DialogClose` | `Dialog.Trigger` / `Dialog.Close` | ✅ 直换；Close 同样支持 `render`（替代 `asChild` 包 Button 的写法：`render={<Button …/>}` 或保留现有嵌套并去掉 asChild、由 Close 直发 className） |
| `DialogPortal` | `Dialog.Portal` | ✅ |
| `DialogOverlay` | `Dialog.Backdrop` | 🔄 更名；`data-open/data-closed` 动画类保留 |
| `DialogContent` | `Dialog.Popup` | 🔄；支持 `initialFocus`/`finalFocus`（按需透传）；`data-open/zoom-in-95` 等类保留 |
| `DialogTitle/Description` | `Dialog.Title/Description` | ✅（**必须保留在 Popup 内**，a11y 依赖） |
| `Sheet`（Dialog 复用） | **`Drawer`**（Base UI 独立组件）或继续用 `Dialog` + 自定 side 类 | 二选一：推荐先用 `Dialog.Popup` 换壳保结构（改动最小），Drawer 作为后续优化项记录 |
| `AlertDialog.Root/Trigger/Portal/Overlay/Content/Title/Description` | `AlertDialog.Root/Trigger/Portal/(DialogBackdrop/DialogPopup/DialogTitle/DialogDescription)` | 🔄 AlertDialog 复用 Dialog 的 parts（源码核验） |
| `AlertDialogAction` / `AlertDialogCancel` | **均改为 `AlertDialog.Close`** | ⚠️ Base UI 没有 Action 部分；两者语义都是"点击即关"，现有实现本就是 Button 包壳，改为 `<AlertDialog.Close render={<Button …/>}>` 即可 |

### 3.4 Tooltip / Tabs / Slider / Switch / Toggle / ToggleGroup / Collapsible

| 组件 | 映射与验证点 |
| --- | --- |
| `Tooltip` | `TooltipProvider` ✅ 存在（源码核验 `delay` prop——我们用的 `delayDuration` 要改名 `delay`，默认值同 0）。结构：Root + Trigger + Portal + **Positioner**（承接 sideOffset）+ Popup + Arrow；Root 另有 `closeDelay`、`trackCursorAxis`。我们 tooltip 内容里 `data-[state=delayed-open]:animate-in` 选择器删除（Base UI 只有 open/closed 状态） |
| `Tabs` | Root/Tab/**List**/Panel/Indicator。我们已用的 `value/defaultValue/orientation/onValueChange` ✅；`activationMode`/`selectOnMove` 在 v1.8 无此 props（默认自动激活），我们也没用。现有 `data-active:` 类直接兼容 |
| `Slider` | 结构变化最大：Root → **Control** → Track → **Indicator**（替代 Radix `Range`）→ Thumb；可加 `Slider.Value`。props：`min/max/step/value/defaultValue/onValueChange ✅`；⚠️ `minStepsBetweenThumbs` 更名 `minStepsBetweenValues`（我们未用）；新增 `thumbAlignment/thumbCollisionBehavior/locale/format`（不需要可不传）。我们 Slider 按值数组渲染多个 Thumb 的写法保留 |
| `Switch` | Root/Thumb ✅；选择器重写：`data-[state=checked]:bg-flame-600` → `data-checked:bg-flame-600`，`data-[state=unchecked]` → `data-unchecked`，Thumb 的 `data-[state=checked]:translate-x-4` 同理 |
| `Toggle` | Root ✅（`pressed`/`onPressedChange`/`defaultPressed` 源码核验）；`data-[state=on]:bg-muted` → `data-pressed:bg-muted`（或保留 `aria-pressed:` 类，已有） |
| `ToggleGroup` | Root/Item ✅；⚠️ Radix `type="multiple"` → Base UI `multiple` prop（源码核验）；`value/onValueChange/defaultValue/disabled` 同名 |
| `Collapsible` | Root/Trigger/**Panel**（Radix `Content` → `Panel`）；`open/onOpenChange/defaultOpen/disabled` ✅；Panel 支持 `keepMounted`；memo-outline 的 `data-[state=open]:rotate-180` → `data-open:rotate-180` |
| `Progress`（官网） | Root/Track/Indicator/Value/Label；Indicator 内联 `width:%`，删手写 transform |
| `Slot` | `@base-ui/react/use-render` 的 `useRender({ defaultTagName, props, render })`，返回 ReactElement；`props` 里放 className/data-* 等默认 props，与 `render` 元素合并（className 拼接、事件合并——hook 文档语义） |

**受影响的 CSS 变量重写清单**（应用 `dropdown-menu.tsx`）：
`max-h-(--radix-dropdown-menu-content-available-height)` → `max-h-(--available-height)`；`w-(--radix-dropdown-menu-trigger-width)` → `w-(--anchor-width)`；`origin-(--radix-dropdown-menu-content-transform-origin)` → `origin-(--transform-origin)`。官网 dropdown 无此类，无此项。

---

## 4. RTL / i18n 接线（两端一次性）

1. **官网**：`RootLayout` 内包 `<DirectionProvider direction={locale === "ar" ? "rtl" : "ltr"}>`（locale 已由 `getLocaleFromPath(pathname)` 得到）。
2. **应用**：i18n 体系在 `apps/web/src/i18n.tsx`（`Locale = "zh-CN" | "en-US"`，localStorage key `flaremo.locale`，React Context）。两语言均 LTR；本期在 `i18n.tsx` 的 Provider 内**预留**：`document.documentElement.lang = locale`，并导出 `direction = locale.startsWith("ar") ? "rtl" : "ltr"` 供挂 `<DirectionProvider>`（挂点：`router-tree.tsx`，TooltipProvider 同层，router-tree.tsx:420 附近）。当前两语言都是 ltr，不产生行为变化。
3. **阿语排版重置**（官网全局样式 + 应用 `index.css`）：
   `[dir="rtl"] :is(h1,h2,h3,h4,[class*="tracking-"]) { letter-spacing: 0; }`
4. **方向图标**：全站语义性图标（`ArrowRight`/`ChevronRight`）统一 `rtl:-rotate-180`（Tailwind v4 内置 `rtl:` variant，基于 `[dir="rtl"]` 属性）。
5. **阿语字体**：`@fontsource-variable/noto-sans-arabic`（已验证 npm 存在，5.3.0）；官网 `tokens.css` 的 `--font-sans` 在 `"Geist Variable"` 后插入 `"Noto Sans Arabic Variable"`（仅阿语字形命中，不干扰其他语言）。
6. **官网 hero nowrap**：`home-page.tsx` 两处 `sm:whitespace-nowrap` 改为仅 en/zh 生效（`[lang-ltr]` 不够精确，直接按 locale 判断 className 条件渲染）。
7. **编码纪律**（写入两端 AGENTS.md 或组件 README）：布局一律 Tailwind 逻辑属性 `ps-/pe-/ms-/me-/start-/end-`；今后不再新增 `left-/right-/pl-/pr-` 用法（既有代码自然替换时改，不专项翻新）。

---

## 5. 执行批次

### 批次 1：官网（单会话，预计半天内含部署）

按序执行，每步可独立 typecheck：

1. `apps/site`：`pnpm add @base-ui/react@~1.8.0` → `pnpm remove radix-ui`（注意同 workspace 内 `@base-ui/react` 版本统一）。
2. `ui/button.tsx` / `ui/badge.tsx`：Slot → `useRender`，对外 `asChild` → `render`；全站 5 处调用点改 `render={<a …/>}`（原 `<a>` 的 href/target/rel 原样进 render 元素；children 写在 Button 内部不变）。
3. `ui/dropdown-menu.tsx`：按 §3.2 重写（locale-switcher 与 site-nav ThemeToggle 的 `Trigger asChild` 一并改为 Trigger 直发 props）。
4. `ui/progress.tsx`：换 Track/Indicator，删手写 translateX；检查 `motion.tsx` 的 `GrowProgress` 视觉。
5. `RootLayout` 包 DirectionProvider；完成 §4 的 3/5/6（官网侧）。
6. **验证清单**：
   - `pnpm --filter @flaremo/site typecheck` + `pnpm --filter @flaremo/site build`；
   - 浏览器走查 zh / en / **ar**（重点：语言切换菜单、主题菜单、FAQ 手风琴；阿语页 RTL 镜像、字距、箭头方向、字体回退）；
   - 键盘走查：Tab 到语言切换器 → Enter 开 → ↑↓ 选择 → Enter 确认 → Esc 关；Tab 循环内无焦点丢失；
   - `pnpm deploy` 部署。

### 批次 2：应用本体（独立会话执行，避免与并行部署撞车）

迁移顺序（依赖面从浅到深）：

1. 依赖安装 + `components.json` 记录更新（`style` 字段当前为 `radix-nova`；组件迁移后该字段仅影响后续 `shadcn add` 的模板来源，**不在本次迁移范围内**，保持不动）。
2. 纯展示类：`badge.tsx`、`button.tsx`（Slot→useRender；应用内 `asChild` 共 31 处、17 个文件，执行时以 grep 清单为准逐一改 `render`）。
3. `tooltip.tsx`（Provider `delayDuration`→`delay`；Content 结构加 Positioner；`data-[state=delayed-open]` 选择器删除；router-tree.tsx:420 的 TooltipProvider 挂点不变）。
4. `toggle.tsx`、`toggle-group.tsx`（`type`→`multiple`；`data-[state=on]`→`data-pressed`）。
5. `switch.tsx`（选择器重写，见 §3.4）。
6. `tabs.tsx`（List/Tab/Panel 更名；`data-active` 已兼容，零选择器改动）。
7. `slider.tsx`（结构加 Control；Range→Indicator；props 面不变）。
8. 弹层类（一个一组，组内 typecheck）：`dialog.tsx` → `alert-dialog.tsx`（Action/Cancel→Close）→ `sheet.tsx`（Dialog 壳保结构）→ `dropdown-menu.tsx`（含 §3.4 的 CSS 变量三处重写）→ `reading/memo-outline.tsx`（Content→Panel + data 选择器）。
9. **每 3–4 个文件停一次**：`pnpm --filter @flaremo/web typecheck`。
10. **全量门禁**（顺序执行，全绿为准）：
    - `pnpm format` → `pnpm lint`（biome）
    - `pnpm check`（含 site/worker/db/domain 等 8 个包）
    - `pnpm test`（vitest）
    - e2e：`tests/e2e/` 14 个 spec（auth-fixture 起底）。重点回归：`memo-flow`（发送断言竞态模式：先等 composer 清空再查时间线卡片，勿改动该断言模式）、`workspace-flow`、`audio-transcript-reading`（memo-outline 所在页面）、`auth-ui-flow`（弹窗密集）。e2e 选择器一律用 role/label/text，**不查库专属 data 属性**（若现有用例查了 `data-state`，改为语义选择器后提交说明）。
11. **键盘 + 读屏走查**：登录 → 编辑器 → 发送 → 右键/工具栏菜单 → 分享弹窗（Sheet）→ 删除确认（AlertDialog）→ 设置开关（Switch/Slider）。VoiceOver 抽查：菜单项朗读、弹窗标题朗读。
12. 移除 `radix-ui` 依赖；`grep -r "radix-ui" apps/*/src` 应为零；`pnpm --filter @flaremo/web build`；`wrangler deploy --config ./wrangler.jsonc`（**kosx 实例先滚，观察 ≥1 日再滚自部署生产**；部署脚本在 flaremo-cloud 仓）。

## 6. 风险与对策（执行者逐条核对）

| # | 风险 | 对策 |
| --- | --- | --- |
| 1 | CSS 变量改名导致下拉宽度/裁剪异常 | §3.4 清单三处；走查语言切换器、应用各下拉 |
| 2 | AlertDialog 无 Action 部分 | §3.3 映射；删除确认流 e2e 回归 |
| 3 | Tooltip 状态选择器（`data-[state=delayed-open]`）失效 | 删除该组类；开合动画仅靠 `data-open/data-closed` |
| 4 | ToggleGroup `type` prop 不存在导致 TS 报错 | grep `type="multiple"`/`type="single"` 全部改 `multiple` 布尔（single 为默认） |
| 5 | `onOpenChange(on, eventDetails)` 签名变化 | 现有回调多为单参箭头函数，TS 兼容；涉及第二参才处理 |
| 6 | 动画选择器遗漏（data-state 残留） | 迁移完 `grep -rn "data-\[state=" apps/*/src` 应为 0 |
| 7 | 焦点行为差异 | 键盘走查 + e2e 弹窗链路；必要时用 `initialFocus/finalFocus` 显式指定 |
| 8 | e2e 断言依赖 Radix DOM | §5.10 规则：role/label 断言，不查 data-state |
| 9 | React 19 + strict mode 下 motion/弹层时序 | 现有测试体系已覆盖，属回归面而非新风险 |
| 10 | 并行会话撞车 | §0 执行者须知 |

## 7. 验收标准（DoD）

- [ ] 两个 package.json 无 `radix-ui`；`grep -r "radix-ui" apps/*/src` 为 0
- [ ] `grep -rn "data-\[state=" apps/*/src` 为 0
- [ ] `pnpm format && pnpm lint && pnpm check && pnpm test` 全绿
- [ ] e2e 14 spec 全绿（重点 spec 按批次 2 §10 核对）
- [ ] 官网 zh/en/ar 三语言视觉走查通过（含键盘）
- [ ] 应用键盘走查全链路 + VoiceOver 抽查通过
- [ ] kosx 部署成功且观察 24h 无故障，再滚自部署生产
- [ ] `docs/base-ui-migration.md` 勾掉本清单并记录实际 diff 摘要

## 8. 明确不做（防止执行者扩大范围）

- FAQ 原生 `<details>`（官网）、产品 mockup、Reveal/PopIn/SpotlightCard 装饰件：不迁。
- React Aria：不引入（触发条件：应用出现"阿语用户 × 历法/数字密集控件"，届时单组件评估）。
- 文案翻译机制：不动（官网 `copy.ts`、应用 `i18n.tsx` 照旧）。
- sonner（应用 toast 库）：不动，Base UI toast 仅记录为备选。
- `components.json` 的 style 字段、shadcn CLI 迁移命令：不使用。
- 大规模逻辑属性翻新既有 `left-/right-` 类：不做，只约束新代码。

## 9. 附录：源码核验记录（2026-09-15）

- 包结构：`npm pack @base-ui/react@1.8.0` 解包核验 58 个子路径；`menu/dialog/tooltip/tabs/slider/switch/toggle/toggle-group/collapsible/progress/direction-provider/use-render` 全部存在。
- 关键 props 以 d.ts/运行时源码验证：Dialog.Root `open/defaultOpen/modal: boolean|'trap-focus'/onOpenChange(open, eventDetails)/onOpenChangeComplete/disablePointerDismissal/actionsRef`；Dialog.Popup `initialFocus/finalFocus`；Menu parts 全集（含 `SubmenuRoot/Viewport/LinkItem`）；Menu.Positioner `side/align/sideOffset/alignOffset/pinned`；Tooltip.Provider `delay`；Tabs parts = Root/List/Tab/Panel/Indicator（无 activationMode）；Slider parts = Root/Value/Label/Control/Track/Indicator/Thumb，`minStepsBetweenValues`、`thumbAlignment`、`locale/format`；Switch `checked/onCheckedChange`、data-`checked/unchecked`；ToggleGroup `multiple`；Collapsible Panel `keepMounted`；Menu.Item `closeOnClick`、`data-highlighted/data-disabled`。
- 弹层 CSS 变量（PositionerCssVars，全部 positioner 共用）：`--available-width/--available-height/--anchor-width/--anchor-height/--transform-origin/--positioner-width/--positioner-height`。
- 内置字符串：全库无硬编码英文 `aria-label`；DirectionContext 消费方共 18 处文件（menu/combo/select/slider/navigation/scroll-area/otp/composite 等）。
- shadcn CLI：`migrate --list` 实测（4.12.0 与 latest 相同）。
- 参考实现：ui.shadcn.com `/docs/components/base/*`（base-nova 样式的 base 版 shadcn 组件源码）。

## 10. 执行结果（2026-09-15，实际执行人补记）

### 10.1 与文档的偏差与修正

1. **`Menu.GroupLabel` 必须包在 `Menu.Group` 内**（§3.2 未写）：Radix 的 `DropdownMenuLabel` 可裸用，Base UI 裸用会抛 production error #31（官网与 dev 均当场复现）。两处 wrapper（site + web `DropdownMenuLabel`）已改为内部自带 `<Menu.Group>` 包裹。
2. **Menu 组合顺序**：§3.2 简图把 Positioner 画在 Portal 外，实际以包内 bundled 文档与源码为准，正确结构是 `Portal > Positioner > Popup`（两层均已照此实现）。
3. **无碍但值得记录的实测发现**：
   - Tailwind v4 的裸 data 变体同时匹配两种属性：`data-open:` → `[data-state=open]` 与 `[data-open]:not([data-open=false])`；`data-active:` 同理；`data-horizontal:`/`data-vertical:` → `[data-orientation=…]`。所以 dialog/sheet/tabs 的既有动画类零改动即兼容（§2.4 的预埋判断全部实测成立）。
   - Base UI 关闭中的弹层面板在退场动画期间仍留在 DOM（约 100ms），Radix 是即时卸载。e2e `memo-flow` 恢复修订用例因此从「整页 `getByText`」改为「scope 到活动 `tabpanel`」（语义选择器，符合 §5.10 纪律）。
   - Base UI 菜单的 Escape/外部点击关闭在**真实输入**下完全正常；此前测试脚手架里合成 `click()`/CUA 坐标失灵造成的假象已逐一排除（IAB 环境问题，非库问题）。
   - 消费端 `DropdownMenuItem.onSelect` → `onClick` 共 4 处（notification-bell / memo-card / memory-page / projects-page）；`Slider` 的 `onValueChange` 参数类型变为 `number | readonly number[]`，reading-audio-bar 一处解构改 `Array.isArray` 判别。
   - `Progress.Root` 的 `value` 在 Base UI 为必填（官网 wrapper 原来解构后未下传，已修）。
4. **未迁（与 §8 一致）**：FAQ 原生 `<details>`、装饰动效件、React Aria、sonner、`components.json` style 字段均未动。

### 10.2 验收清单执行结果

- [x] `grep -r "radix-ui" apps/*/src` = 0；两个 package.json 无 `radix-ui`
- [x] `grep -rn "data-\[state=" apps/*/src` = 0
- [x] `pnpm format`（4 文件被 format 规整）→ `pnpm lint`（0 error，21 条既有 warning 全在 worker/domain，与迁移无关）→ `pnpm check` → `pnpm typecheck` 全绿
- [x] `pnpm test`：web 93 / worker 172 / domain 119 / contracts 13 / memos 6 / telegram-bot 4 全绿
- [x] e2e 46/46 全绿（memo-flow 1 例断言按 §5.10 语义化后通过）
- [x] 官网 zh/en/ar 走查：8 语言构建成功；ar 页 RTL 镜像、箭头翻转（`rtl:-rotate-180`）、阿文连笔（字距重置生效）、Noto Sans Arabic 加载、hero nowrap 按 locale 条件化；语言菜单/主题菜单真实键盘流程（Enter 开 → ↑↓ 高亮 → Esc 关 → 选中跳转）经真实 Chromium Playwright 验证 3/3 通过
- [x] 应用键盘/交互走查由 e2e 46 spec（弹窗/菜单/共享/删除确认全链路）覆盖；VoiceOver 人工抽查未做，留待真机随访
- [x] kosx 已滚 `7b722cb`（version fc1602ed，冒烟 /openapi.json v0.20.0 一致）；自部署生产待 kosx 观察 24h 后手动滚
