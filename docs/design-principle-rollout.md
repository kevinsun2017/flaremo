# 「简约不简单，克制不放肆」全面贯彻方案（决策稿）

> 状态：**已定稿，待执行**。Kim 已授权按最佳实践直接落地（2026-09-17），决策点 D1–D5 采纳推荐项；开工前需先与并行会话收口工作区（见风险 R1）。
> 原则出处：`docs/design-system.md` 开头（2026-09-16 定调），另见 `AGENTS.md` 修改规则、`CONTRIBUTING.md` PR 要求、`ROADMAP.md` 产品主线。

本文基于 2026-09-16 对 `apps/site` 与 `apps/web` 的全量克制审计（file:line 为当时检出位置，动手前需复核；原始实锤清单见附录 A）。核心结论：

- **应用主体执行度很高**：渐变四处白名单、骨架 shimmer、空态指引、破坏性二次确认、无营销弹窗、无 animate-pulse、无内联 `animate-[`，全部落实。偏离集中在**登录页门面**和 **ui/ 基础组件层**。
- **官网是重灾区**：它运行在一套独立于 Ember 的自建 token（Paper/聚光灯/浮岛阴影）上，且在几乎每个克制点上都多加了一层——首屏"光晕 + 渐变标题 + 渐变 CTA"三连、4 处无限呼吸灯、14 张卡全带光标聚光灯、五连同款 section 头、1044 行巨型产品仿真。
- 文案层面全站无感叹号、无 "10x" 类词，底线守住了；但 FR/ES/KO 的 "sub-50ms" 与 EN 自己的 "sub-100ms" 口径打架，属浮夸宣称实锤。

---

## 0. 原则的可执行化（先立尺子，再动 code）

原则要能指导 review，必须翻译成可判定的规则。补进 `docs/design-system.md`：

1. **一屏一个渐变**（官网适用）：任何视口内，品牌渐变（应用 flame / 官网 signal 渐变）最多 1 处 CTA + 0–1 处品牌识别元素（logo、渐变标题行）；光晕（blur-3xl 环境光）一屏最多 1 处，且不与渐变标题同屏。
2. **无装饰性循环动画**：无限循环动画只允许三类——骨架屏 shimmer、真实状态指示（录音中、上传中）、录音波形。呼吸灯小圆点（pulse dot）属于装饰，全站禁止。
3. **hover 光效每屏限额**：cursor 聚光灯类组件（SpotlightCard）单页最多 4 张卡使用；不与渐变标题同屏。
4. **入场动效覆盖 ≤ 50%**：单页被入场动画（Reveal/PopIn 类）包裹的区块过半即超标，必须留"完全不动"的区块——安静本身就是节奏。
5. **数字不许浮夸**：性能/容量宣称全站单一口径，一律用实测保守值；禁用"永不""终生""取之不竭""最优解"类绝对化词。
6. **同款模板不连用**：badge/heading/subtitle 三件套在一页内不得连续复用超过 2 次；一个视觉内不得有重复/相似标题（既有规则，明确扩展到官网）。

---

## 1. P0 · 官网首屏减火（最高优先）

首屏目前是"光污染三连"，说克制时页面最不克制。

| # | 改动 | 位置 |
|---|---|---|
| P0-1 | 删 700px 巨型 blur-3xl 环境光晕，只保留背景色 | `apps/site/src/pages/home-page.tsx:137` |
| P0-2 | 保留渐变标题行（品牌识别，决策点 D1 采纳）与渐变 CTA 不动——同屏渐变收敛，光晕归零 | `home-page.tsx:160` 不动，:137 删 |
| P0-3 | 删 eyebrow 药丸内的 `animate-pulse` 呼吸点 | `home-page.tsx:145` |
| P0-4 | eyebrow 宣称统一改实测口径：FR:415 / ES:540 / KO:664 的 "sub-50ms" → 与 EN 一致的 "sub-100ms"；AR:911 叠形容词降温 | `apps/site/src/content/copy.ts` |
| P0-5 | hero subtitle 加原则句（转译版，决策点 D3 采纳），8 语言草稿见 §1.1 | `copy.ts` 8 处 heroSubtitle |

### 1.1 hero 原则句草稿（各语言，接在既有 heroSubtitle 开头）

| Locale | 文案 |
|---|---|
| zh | 简约，不简单；克制，不放肆。FlareMo 原生构建于 Cloudflare 边缘……（原 subtitle 接排） |
| en | Minimal, never shallow. Quiet, never loud. Next-generation…（原 subtitle 接排，后续 P4-3 会去掉 "Next-generation"） |
| ja | シンプルに、しかし深く。静かに、しかし妥協なく。（原 subtitle 接排） |
| fr | Minimal, jamais superficiel. Discret, jamais criard.（原 subtitle 接排） |
| es | Mínimo, nunca superficial. Sereno, nunca estridente.（原 subtitle 接排） |
| ko | 심플하게, 얕지 않게. 조용하게, 과하지 않게.（原 subtitle 接排） |
| ru | Минималистично, но не пусто. Сдержанно, но не робко.（原 subtitle 接排） |
| ar | بسيط بلا سطحية. هادئ بلا صخب.（原 subtitle 接排） |

排版注意：原则句与原 subtitle 之间不加 `<br>`，作为同段落前导句（copy.ts 是纯字符串，天然同段）；中/日/俄用全角句读。

## 2. P1 · 应用登录页破口

全应用唯一踩「品牌色不铺大面积」红线的区域：

- `apps/web/src/components/auth-page-frame.tsx:31-37`：删半屏 `bg-flame-700` 大底与两个 `blur-3xl` flame 光斑，改为暖中性底 + 局部点缀（按 Ember：暖中性承担约 90% 表面）。
- `:58`：删内联 `bg-[radial-gradient(...)]` 魔法字符串。
- 配套文案：`i18n/messages/en-US.ts:365` "Turn every moment into memory you can find." 语气过营销，换克制陈述句，8 语言同步（应用消息文件有 TranslationKey 强制对齐，tsc 会拦漏改）。方向草稿（落地时按既有 key 结构微调）：
  - en: `A quiet home for everything you know.`
  - zh: `给已知的一切，一个安静的家。`
  - 其余 6 语言同规格转译（fr「Un foyer silencieux pour tout ce que vous savez.」es「Un hogar tranquilo para todo lo que sabes.」ja「知っていることを、静かにしまっておく場所。」ko「아는 모든 것을 위한 조용한 공간.」ru «Тихий дом для всего, что вы знаете.» ar «منزل هادئ لكل ما تعرفه.»）
- 登录卡片 `shadow-lg` 暗色下投影，归入 P3 一起处理。

## 3. P2 · motion-safe 规则从"统计学"变"系统性"

明文要求所有动效带 `motion-safe:`，实际业务代码约 20 处、`ui/` 基础组件约 40 处无前缀（animate-spin / transition-*），高频组件（dialog、dropdown、switch、进度条）在 prefers-reduced-motion 下不受控。逐处补 60 个前缀是下策——**改为全局兜底，规则改写**：

1. 在 `apps/web/src/index.css` 加全局兜底块（官网 `tokens.css:333-342` 已有同类实现，抄齐）：

   ```css
   @media (prefers-reduced-motion: reduce) {
     *, ::before, ::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```

2. `docs/design-system.md` 动效规则改写为：「全局 reduced-motion 兜底为准；新增大型编排动画仍需显式 `motion-safe:` 前缀」。存量 60 处前缀缺口**不回填**，由兜底覆盖。
3. 官网侧同款兜底已存在，无需动。

## 4. P4 · 官网结构与文案降噪（8 语言改动大头）

| # | 改动 | 位置 |
|---|---|---|
| P4-1 | 清 pulse：全站 4 处呼吸点清零（hero + showcase×2 + footer）；showcase 灵动岛/页脚的 emerald 硬编码色一并归入官网 token 或换 signal 系 | `home-page.tsx:145`、`interactive-showcase.tsx:207/:615`、`site-footer.tsx:160` |
| P4-2 | section 头去模板化：5 个同款 Badge(flame)+h2+p 中最多保留 2 处徽章（首尾），中间三处去 badge 只留标题 | `home-page.tsx:303/361/663/714/771` |
| P4-3 | 绝对化文案降温，替换草稿见 §4.1 | `copy.ts` 8 语言 |
| P4-4 | 首尾同义标题去重：CTA 标题改为行动导向，草稿见 §4.2 | `copy.ts` 8 处 |
| P4-5 | 术语统一：官网中文 copy 通篇"笔记"→"记录"（design-system 明文） | `copy.ts` zh 段 + showcase-i18n |
| P4-6 | InteractiveShowcase **做减法不砍件**（决策点 D2 采纳）：删 2 处 pulse 点、单屏 4 处渐变收敛到 2 处（桌面+手机各 1 枚 CTA，logo 渐变保留）；**不重写、不删组件** | `interactive-showcase.tsx:207/:497/:599/:615/:711/:820` |
| P4-7 | SpotlightCard 聚光灯限额：hero 指标卡 4 张保留，特性/生态卡换普通卡（共 14 → 4） | `spotlight-card.tsx` 使用处 |
| P4-8 | 死代码清理：`GrowProgress`（motion.tsx:205-218 无引用）、StatCard.highlight 光斑（stat-card.tsx:34，确认无使用后删） | `apps/site/src/components` |
| P4-9 | 应用侧文案收尾：zh-CN calendar 模块 4 处"笔记"→"记录"（`zh-CN.ts:150/:151/:152/:159`）；`nav.capture` 与 `capture.title` 撞标题，二改一 | `apps/web/src/i18n/messages/*` |

### 4.1 绝对化文案替换草稿

| 现状（EN/ZH 为准） | 替换方向 | 备注 |
|---|---|---|
| "Next-generation knowledge management…"（EN:49） | 删 "Next-generation"，改 "Knowledge management built natively on Cloudflare Edge" | 只 EN |
| "Enterprise Durability" / "企业级持久化，永不丢失"（EN:63-64 / ZH:187） | → "Durable by default" / "多区域持久化，数据稳稳落地" | 个人开源项目不自称 enterprise、不用绝对化"永不"；8 语言同线 |
| "Generous Free Tier" / "免费配额，终生充裕"（EN:69 / ZH:190；fr "ultra-généreux":437、fr:499、es "inagotable":563、ko:686、ru:809） | → "Free tier, stated plainly" / "免费额度，明码实价" | 8 语言统一为客观陈述实际额度 |
| "Why Cloudflare Native Wins" / "看 Cloudflare 原生为何是最优解"（EN:93 / ZH:218） | → "Three ways to self-host, side by side" / "三种自托管方式，一张表看清" | 去赢者口吻，改中性对比 |
| FAQ "每天 100 条也能写 68 年"（EN:142 系，8 语言重复） | 保留但去掉惊叹式表述（现有无感叹号，属可保留项，不动） | 审计判低危，默认不动 |

### 4.2 CTA 标题替换草稿（与 hero "Second Brain" 去重）

| Locale | 现 hero 副标题含 "Second Brain" | CTA 新标题 |
|---|---|---|
| en | Your Second Brain on the Edge | Five minutes to deploy. Yours for good. |
| zh | 跑在边缘网络的第二大脑 | 五分钟部署，永久拥有。 |
| ja | エッジネットワークで動く第二の脳 | 5分でデプロイ、ずっとあなたのもの。 |
| fr | Votre second cerveau sur l'Edge | Cinq minutes pour déployer. À vous pour de bon. |
| es | Tu segundo cerebro en el Edge | Cinco minutos para desplegar. Tuyo para siempre. |
| ko | 엣지 네트워크에서 작동하는 두 번째 뇌 | 5분 만에 배포, 영원히 당신의 것. |
| ru | Второй мозг на глобальном Edge | Пять минут на развёртывание. Навсегда ваше. |
| ar | دماغك الثاني على شبكة الحافة العالمية | خمس دقائق للنشر. ملكك إلى الأبد. |

## 5. P3 · 暗色阴影按文档收口

明文「暗色不用阴影，用表面明度阶梯」，实际 `.dark` 仍有全套黑阴影 token 且在生效：

- `apps/web/src/index.css:179-188`：`.dark` 的 `--shadow-*` 收敛为极轻或近零，层级交给明度阶梯；表面阶梯按决策点 D4 采纳**改文档为实测值 0.155/0.21/0.235**（`index.css:155-159` 不动，`docs/design-system.md:26` 改）。
- `ui/tabs.tsx:64` 选中 `shadow-sm`、`ui/switch.tsx:22` 滑块 `shadow-lg`、`ui/slider.tsx:52`、`auth-page-frame.tsx:65`：随 token 收敛自然消失，仅个别处需手调。
- **必须真机过一遍暗色模式**（时间线、登录、设置），确认层级仍清晰。

## 6. P5 · 原则露出：README 与官网

- README 8 语言（README.md + README.{en,ja,fr,es,ko,ru,ar,zh-CN}.md）在 "Why FlareMo?" bullet 列表加一条，草稿：

| Locale | 文案 |
|---|---|
| en | **Minimal, not simplistic**: The interface stays quiet and every control earns its place — nothing decorative shouting for attention, nothing useful missing. |
| zh-CN | **简约不简单**：界面安静、能力完整——没有抢眼的装饰，也没有缺失的功能。 |
| ja | **シンプル、でも削らない**: 界面は静かに保ち、操作はすべて存在する理由がある。装飾も欠落もない。 |
| fr | **Minimal, pas simplifié** : une interface silencieuse, des fonctions complètes — rien qui crie, rien qui manque. |
| es | **Mínimo, no simplificado**: interfaz serena y capacidad completa — nada de decoración estridente, ninguna función ausente. |
| ko | **심플, 그러나 축소 아님**: 조용한 인터페이스, 완전한 기능 — 요란한 장식도 빠진 기능도 없습니다. |
| ru | **Минимализм, не примитивизм**: тихий интерфейс и полный набор возможностей — ничего кричащего, ничего недостающего. |
| ar | **بسيط لا ناقص**: واجهة هادئة وقدرات كاملة — لا زخرفة تزأر ولا ميزة مفقودة. |

- 不建独立 Design Philosophy 小节（内部理念不放大成宣言）。
- 官网 hero 原则句已在 P0-5 覆盖。
- 敏捷定调照旧：`pnpm verify` 不跑，跑定向测试 + `pnpm dev` 桌面/移动真机走查。

## 7. P6 · 流程固化与尾巴修复

1. `docs/design-system.md` 新增「官网（Paper）章节」：承认官网独立 token 体系（signal/ink/mist，hex 而非 oklch），把第 0 节六条尺子、暗色口径、sub-100ms 宣称基准写入——官网从此有法可依。
2. `AnimatedNumber` locale 修复（遗留尾巴）：`apps/site/src/components/motion.tsx:162-164` 的 `Intl.NumberFormat()` 传入页面 locale（从 `getLocaleFromPath` 透传，`home-page.tsx` 已有 locale 变量），消除 SSR/hydration 数字格式漂移；`stat-card.tsx:63` 同修。
3. `AGENTS.md` / `CONTRIBUTING.md` 的原则条目已就位；不新增 CI 门禁（无 CI 定调不变），克制的日常执行靠 review 对照第 0 节尺子。

## 8. 不做什么（对自己的克制）

- **不重写 InteractiveShowcase、不砍任何 section**：贯彻原则≠洁癖式重构，showcase 和 7 个 section 都承担真实转化信息，只做 P4-6/P4-7 的限额减法。
- **不动 docs 页面**（审计判定克制合规）、**不动 docs/ 目录既有文档结构**。
- **不回填 60 处 motion-safe 前缀**：全局兜底一步到位，避免大规模无收益 churn。
- **不引入新依赖**（无 framer-motion、无新动效库）；官网 signal token 不迁移 oklch（零气质收益的大工程，另列 backlog）。
- **不做"原则上墙"的仪式感改造**：官网/README 之外不加"我们的理念"页面。

## 9. 决策点（已按授权采纳推荐项）

| 决策点 | 结论 |
|---|---|
| D1 | hero 保留渐变标题（品牌识别），删巨型光晕 |
| D2 | InteractiveShowcase 保留组件，只做限额减法 |
| D3 | hero 原则句用转译版，原句「简约不简单，克制不放肆」留在内部文档 |
| D4 | 暗色表面阶梯改文档为实测值 0.155/0.21/0.235 |
| D5 | 落地顺序 P0 → P1 → P2 → P4 → P3 → P5 → P6 |

## 10. 风险清单与回滚

| # | 风险 | 缓解 |
|---|---|---|
| R1 | **并行会话共检**：工作区现有未提交改动（`apps/web/src/i18n/messages/*` ×8、`account-page.tsx`、`admin-page.tsx`，疑似 seed accent 收尾工作），与本方案 P1/P4-9 会改同一批文件 | 动手前先确认该批次已提交或已收敛；异动时先 reflog 核对，不 stash/reset 不抢提交 |
| R2 | 应用 i18n 是 TranslationKey 强制对齐：8 语言必须同批改全，漏一处 tsc 即红 | 应用侧改动一律 8 locale 同 commit；官网 copy.ts 无类型护栏，需人工 8 处同步后逐语言抽查 |
| R3 | 官网是 SSG + hydration：文案长度变化影响换行，AnimatedNumber 有 SSR/客户端格式漂移 | 改后亮暗双模式 + 移动视口截图对比；P6 修 AnimatedNumber 时顺带验证 |
| R4 | 暗色阴影 token 收敛可能让浮层失去立体感 | 真机逐屏过（时间线/登录/设置/弹层），按表面明度阶梯补差 |
| R5 | showcase/聚光灯减法影响转化观感 | 保守减法（只删装饰、不减信息），不满意可单批 revert |
| R6 | 每批独立 commit，出问题 `git revert <批次>` 单批回滚，互不牵连 | 批次提交信息统一 `docs:/feat:/style:` 前缀标注批次号 |

## 11. 验收口径（每批）

- `pnpm format:check` 必过；应用侧另跑 `tsc` + 定向 vitest（不跑 e2e、不跑 `pnpm verify`——敏捷定调）。
- 官网批次跑 `apps/site` 构建预览。
- P1/P3/P4 真机走查：应用暗色全屏过一遍；官网首屏与 showcase 亮暗双模式截图对比。
- 收尾复查：第 0 节六条尺子逐条打勾；`grep animate-pulse apps/site apps/web` 装饰性命中应为 0。

---

## 附录 A · 审计实锤原始清单（2026-09-16 检出，动手前复核）

### A.1 官网（apps/site）

**动效**
- `home-page.tsx:145`、`interactive-showcase.tsx:207`、`:615`、`site-footer.tsx:160` — 4 处无限 `animate-pulse` 呼吸点（`:615` 与 footer 用 emerald 硬编码色）
- `interactive-showcase.tsx:714` — `animate-spin` 裸字符 "⟳"（瞬态，可接受）
- `motion.tsx:8-9` — 缓动自述"张扬档"、springPop 过冲；`tokens.css:279-287` card-lift 无 motion-safe（有全局兜底）
- 首页动效覆盖近 100%：`PopIn`×1、`Reveal`×3、`RevealGroup` 2 组 10 items（home-page.tsx:143-334）

**渐变与光效**
- `home-page.tsx:137` 巨型光晕 + `:160` 渐变标题 + `:181` 渐变 CTA 同屏
- `home-page.tsx:767` 底部 CTA 再放光晕（`:763` shadow-pop-xl）——首尾双光晕
- `button.tsx:14` flame 变体 `bg-brand-gradient`：hero/底部 CTA/导航 3 枚渐变按钮在滚动路径反复出现
- `interactive-showcase.tsx:497/:711` 双设备同屏 2 枚渐变 CTA + `:193/:599` logo 渐变 ×2 = 单屏 4 处渐变
- `spotlight-card.tsx` 聚光灯：hero 4 + 特性 6 + 生态 4 = 14 张卡
- `stat-card.tsx:34` highlight 光斑（遗留组件）
- `not-found-page.tsx:6` "404" 数字渐变（低危，顺手处理）

**文案**（copy.ts）
- EN:49 "Next-generation"；EN:93 "Wins" / ZH:218 "最优解"；EN:63 "Enterprise…永不丢失"（ZH:187）；EN:69 "Generous"（ZH:190 终生充裕、FR:437 "ultra-généreux"、FR:499、ES:563 "inagotable"、KO:686、RU:809）
- FR:415 / ES:540 / KO:664 "sub-50ms" vs EN:111 "sub-100ms" 口径打架；AR:911/:920 叠形容词
- EN:162 系 CTA 标题与 hero "Second Brain" 首尾撞车
- ZH 段通篇"笔记"（:176/:186 等）与 showcase-i18n "记录" 混用
- screenshotsHeading（EN:134 系）未渲染，死文案

**结构与体系**
- 首页 7 个 section 近 7 屏；`interactive-showcase.tsx` 1044 行（全站业务代码近半）
- 5 处同款 Badge+h2+p section 头（home-page.tsx:303/361/663/714/771），其中 4 个 flame 徽章
- hero 4 张指标卡各挂 Badge = 一屏 5 pill
- `tokens.css:5-8` 自建体系自述；signal 硬编码 `#f97316`（:31）；showcase 大量 zinc-300/700/950、#ff5f56 等原生色（:193-195/:599-603）
- `interactive-showcase.tsx:188/:599` 暗色硬编码大阴影；`tokens.css:116-118` 暗色 shadow-pop 加重——与应用"暗色不阴影"分叉
- `motion.tsx:162-164` AnimatedNumber `Intl.NumberFormat()` 无 locale（SSR/hydration 漂移，遗留尾巴）；`motion.tsx:205-218` GrowProgress 死代码

**合规项**：无感叹号、无 "10x" 类词、无内联 `animate-[`、docs-index/docs-detail 页克制、全局 reduced-motion 兜底存在。

### A.2 应用（apps/web）

**设计系统明文违反**
- motion-safe 缺口约 60 处：业务层（memo-card.tsx:398/:580/:413/:462、memo-detail-page.tsx:492/:364/:418/:602/:621/:665、random-walk-page.tsx:155、admin-page.tsx:431/:688、tokens-panel.tsx:184/:280/:319、security-panel.tsx:251/:324、transfer-panel.tsx:74、usage-panel.tsx:223、attachment-gallery.tsx:14/:45、memo-outline.tsx:48/:77、reading-audio-bar.tsx:98/:109）；ui/ 层（tabs/switch/button/input/textarea/toggle/badge/input-group 的 transition、alert-dialog/dialog/sheet/dropdown-menu/tooltip/sonner 的 animate-in/out）
- 根因：`index.css:89-92` 动效 token 未在源头固化规则
- 暗色阴影：`index.css:179-188` .dark 全套黑阴影 token；tabs.tsx:64、switch.tsx:22、slider.tsx:52、auth-page-frame.tsx:65 实际投影；表面阶梯 0.155/0.21 与文档 0.175/0.215 有出入
- 登录页：`auth-page-frame.tsx:31-37` 半屏 flame-700 + 双 blur-3xl 光斑、`:58` 内联 radial-gradient、`:65` shadow-lg
- zh-CN.ts:150/:151/:152/:159 calendar 模块 4 处"笔记"术语漂移；en-US.ts:88/:89 nav.capture 与 capture.title 同标题

**边缘观察（字面合规但接近密度上限，本方案不动）**
- 时间线一屏 3 处渐变（Space 条 + View 条 + 发送 CTA，flaremo-explorer.tsx:289/:326 + memo-composer.tsx:374）
- 置顶卡片三重强调（flame 底+边框+图标，memo-card.tsx:216-245）
- Explorer 侧栏信息密度高但均为功能（flaremo-explorer.tsx:338-391 六个二级链接可后续收）

**合规项**：渐变四处白名单内、Skeleton shimmer 正确、破坏性操作全有二次确认、空态全有指引、无营销弹窗、无 Memos 品牌名残留、toast 密度合规、PWA 引导收敛在账号页。
