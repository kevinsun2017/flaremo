# 实例主题色定制（Instance Accent Color）需求文档

状态：已实施（2026-09-16 同日交付，验收见文末附录）
日期：2026-09-16
范围：FlareMo 主应用（apps/web）+ worker（apps/worker）+ packages/domain；不含官网（apps/site）

## 1. 目标与定位

在 admin 的品牌设置（BrandingCard）中新增**实例级主题色**，与现有白标（产品名、logo）同列。选色后全站（含登录页、公开分享页）换色，明暗两态自动适配。

**明确不做**：

- **per-user 主题色**——团队知识库场景下，每人一个颜色会让分享页和协作视图失去一致性，且与空间模型的整体感冲突。明暗切换保留个人/localStorage 机制不动。
- **官网换色**——官网是独立 token 体系（hex、值与主应用不对齐），不纳入本次。对齐官网 token 是另一个债，另行处理。
- **自定义任意取色**——v1 只做预置色板；种子色推导是纯函数、随时可加，预留 `accent` 字段的扩展空间。
- **邮件模板换色**——email.ts 内联 hex 独立体系，保持品牌橙不动。

## 2. 预置色板（8 套）

原料取自 [Radix Colors](https://www.radix-ui.com/colors) v3（业界公认的高级感 UI 色阶底座，Linear/WorkOS 同源；仅色值，无组件依赖，不违反 radix-ui 组件清零的决定）。已将全部关键档位从 Radix hex 实测换算为 oklch。

| id | 名称（中文/英文） | Radix 色阶 | 亮色实底（step 9）oklch | 气质 |
|---|---|---|---|---|
| `flame` | 火焰 Flame | 现役（默认） | oklch(0.63 0.19 35) | 品牌现役，不变 |
| `ocean` | 海洋 Ocean | blue | oklch(0.649 0.193 252) | 经典 SaaS 信任感 |
| `indigo` | 靛蓝 Indigo | indigo | oklch(0.544 0.191 267) | Stripe 式稳重 |
| `iris` | 鸢尾 Iris | iris | oklch(0.54 0.184 278) | Linear 式紫，最高级感口碑 |
| `jade` | 翡翠 Jade | jade | oklch(0.642 0.115 171) | 沉静绿，知识库气质 |
| `teal` | 湖水 Teal | teal | oklch(0.649 0.114 182) | 清爽青绿 |
| `crimson` | 绯红 Crimson | crimson | oklch(0.634 0.213 1) | 有能量的粉红 |
| `amber` | 琥珀 Amber | amber | oklch(0.854 0.157 84) | 暖金，特殊但好看 |

取舍说明：

- 没选纯红系（ruby/tomato）——与 `--destructive` 状态色打架。
- 紫色系三选一保 iris（violet/plum/pink 弃用），避免选择疲劳。
- **amber 特殊**：其 step 9 为亮黄，白字对比不达标（Radix 官方归类「需深色前景」）。落地时 amber 预置单独给 `--primary-foreground: oklch(0.315 0.06 70)`（深底字），其余预置沿用白字。
- dark 模式实底沿用 Radix dark step 9/10（色相不变、更亮的档位），与现役机制（暗色 `--primary` 取 flame-400）同构。

### 2.1 色阶档位映射（每套预置 = 一个 CSS 文件片段）

现有 flame 阶的语义角色按消费点盘点结果映射到 Radix 档位（L 值为对照现有 flame 各档的目标区间，实现时以全档真机验收微调）：

| 现有变量 | 语义角色（消费点） | 取值来源（Radix light / dark） |
|---|---|---|
| `--flame-50` | accent 底色 | light step 2（L≈0.96） |
| `--flame-100` | badge 底、auth 光斑 | light step 3（L≈0.92） |
| `--flame-200` | 暗色 accent 文字 | light step 4（L≈0.87） |
| `--flame-300` | hover 过渡带 | light step 5（L≈0.79） |
| `--flame-400` | **暗色 primary / ring / selection** | dark step 10（L 0.66–0.79 带内） |
| `--flame-500` | **亮色 primary / 日历今日 / 进度条** | light step 9（各 hue L 不同，Radix 有意为之） |
| `--flame-600` | switch 选中底 | light step 10（hover 档） |
| `--flame-700` | 亮色 accent 文字 / auth 侧栏底 | light step 11（文字档，L 0.47–0.57） |
| `--flame-coral` | `--gradient-brand` 终端色 | 取该阶 dark step 9（保留渐变两端的明度跳变感） |
| `--primary-foreground` | 实底按钮文字 | 白字（amber 用深字，见上） |

实施时每套预置是一组完整的 `:root[data-accent="…"]` / `.dark[data-accent="…"]` 变量覆盖块，全档值从 Radix 官方 hex 换算（脚本已验证转换链路），不强行套用 flame 的 C 轨道——绿色系在 sRGB 的最大色度低于橙色（jade step 9 C=0.115 vs flame C=0.19），强行套轨道会触发浏览器 gamut-clamp，渲染结果不可控。

## 3. 架构方案

### 3.1 Token 层（apps/web/src/index.css）

现状盘点结论：品牌色真源只有 `index.css` 的 `--flame-50..700 + --flame-coral + --gradient-brand`（L98–111），`--primary/--accent/--ring` 全部经 var() 引用，组件层零硬编码 hex（src/ 内 grep 为零）。因此：

- **重命名 `--flame-*` → `--brand-*`（随本次一并做）**：换色后「flame」这个名字会变成谎言。`@theme inline` 的 `--color-brand-*`、Tailwind class `flame-*` → `brand-*`、`.bg-brand-gradient` 保持原名（它本就叫 brand）。消费点约 25 处（badge/slider/switch/memo-card/composer/calendar/explorer/auth-frame/usage-bar 等具体清单见 §2.1 角色表来源盘点），机械替换 + grep 验证清零。
- 默认值（`:root` / `.dark` 现有块）= `flame` 预置的值，保持现状视觉零变化。
- 新增 7 个预置的覆盖块：`:root[data-accent="ocean"] { --brand-50: …; … --gradient-brand: …; }` 与对应 `.dark[data-accent="ocean"]`。约定：**CSS 变量名 `--brand-*` 是内部命名，与预置 id 无关**。
- `--primary-foreground`：`:root` 的白字为默认；`[data-accent="amber"]` 单独覆盖。

### 3.2 下发链路（worker + domain）

复用 branding 白标的完整链路，不新建端点：

- **存储**：`StoredBranding` JSON（owner 的 settings 行，key=`flaremo.instance.BRANDING`，`packages/domain/src/branding.ts`）新增字段 `accent: string | null`。`null`/缺省 = `flame`；非白名单 id 一律回落 `flame`。
- **常量**：`packages/domain/src/branding.ts` 新增 `BRANDING_ACCENTS = ["flame","ocean","indigo","iris","jade","teal","crimson","amber"] as const` 与 `resolveBrandingAccent()`。
- **校验**：`updateBrandingSchema`（`apps/worker/src/routes/admin-api.ts:128`）新增 `accent: z.enum(BRANDING_ACCENTS).nullable()`；`PUT /api/app/admin/branding` 透传。
- **公开下发**：`GET /api/app/branding` 响应（`branding-api.ts:20-39`）新增 `accent` 字段；该端点无缓存头、每次直读 D1，改色即时生效（与产品名一致，无 30s identity 缓存问题——缓存不覆盖 branding）。

### 3.3 应用层（apps/web）

- **类型**：`api.ts` 的 `BrandingInfo`/`AdminBranding` 加 `accent`。
- **BrandingProvider**（`src/branding.tsx`）：解析 branding 后 `document.documentElement.dataset.accent = accent`；`flame` 时不写属性（默认即 flame，少一层选择器）。卸载/回落清属性。
- **应用时机**：Provider mount 时随现有 `/api/app/branding` 请求写入。非默认预置的实例硬刷新时会有一次「默认橙→目标色」的短暂闪变（SPA 无 SSR，属性必须等 fetch）。**接受**：闪变仅在自定义实例的硬刷新出现，与白标 logo 的加载时序同级；不为此做阻塞首帧的内联 fetch。若后续真机觉得刺眼，可加内联脚本缓存 accent 到 localStorage 加速二次访问——留作观察项，v1 不做。
- **admin UI**：BrandingCard（`pages/admin-page.tsx:494`）在产品名区块上方新增「主题色」行：8 个色样九宫格（圆形色点，hover 显示名称 tooltip），点击即调 `PUT /branding`；保存成功后 Provider 立即应用（乐观更新 + react-query 缓存同步）。当前选中项带 ring 描边。**不做**自由取色器、不做实时预览面板（点选即所见即所得，全站即变）。
- **回滚面**：BrandingCard 已有 owner-only 权限，无新增权限面。

### 3.4 换色覆盖不到的硬点（诚实清单）

1. **favicon / app icon / manifest icons（9 个 PNG 位图）**：橙色位图无法用 CSS 换色。方案：**构建时**为每个预置生成同尺寸 PNG 集（`public/brand/<accent>/flaremo-mark-light-300.png` 等），theme-provider 的 `applyFavicon` 与 index.html 内联脚本按 accent 选路径；`site.webmanifest` 不动（icons 保品牌橙，PWA 安装场景优先品牌一致）。favicon 生成用一次性脚本（重绘 logo SVG 蒙版 + 预置底色），产物入库，运行时零成本。自定义 logo 上传的用户不受影响（本就不参与 favicon，现状保持）。
2. **`theme-provider.tsx:56` THEME_COLORS 与 index.html FOUC 脚本**：这两个是**背景中性色**（浏览器 chrome 色），与品牌色无关，不随预置变。顺手修一个陈旧 bug：index.html:9 meta theme-color 初始值 `#17191d` 与 FOUC 脚本写入的 `#0d0c0b`/`#faf9f7` 不一致，对齐。
3. **`public/offline.html`**：离线页独立硬编码珊瑚橙，不走主应用 CSS。v1 保持不动（离线页可见频率极低），记入已知限制。
4. **邮件模板**：品牌橙不动（见 §1）。

## 4. i18n

8 语言补 key：`branding.accent`（标题）、8 个预置名（如 `accent.flame`="火焰"、`accent.ocean`="海洋"/"Ocean"…）。走现有 TranslationKey 类型强制对齐管线。阿语文案正常直译，无 RTL 布局新增（九宫格天然对称）。

## 5. 测试与验收

- **单测**：`resolveBrandingAccent` 白名单回落逻辑；schema 拒绝非白名单 id。
- **e2e**（沿用现有 admin branding 用例的框架）：admin 改 accent → 断言 `PUT` 成功 + `html[data-accent]` 变化 + 刷新后持久；改回 flame → 属性消失。
- **真机视觉验收**（明暗 × 8 预置共 16 组，用 visual-analysis 截图对比）：重点核对 auth-page-frame 整块侧栏、composer 聚焦环、switch/calendar/badge/进度条、`.bg-brand-gradient` 主 CTA、分享页、`::selection`。重点风险：① iris/crimson 在暗色的 ring 可见度；② amber 深色按钮文字对比（WCAG AA）；③ 亮色模式下 indigo/iris primary（L≈0.54）比 flame 深，链接文字色 step 11 需达 AA。
- **验收标准**：全部预置明暗两态无对比度不达标、无 gamut 抖动；默认 flame 视觉像素级不变（回归底线）。

## 6. 实施切分与顺序

1. **W1 token 层**：`--flame-*`→`--brand-*` 重命名（机械替换）+ 默认值不变，跑全量 e2e 确认零视觉回归。
2. **W2 色板文件**：7 个预置覆盖块写入 index.css + amber 的 `--primary-foreground` 特例。
3. **W3 服务端**：domain 常量/类型 + schema + 两个端点 + 单测。
4. **W4 前端**：类型 + Provider 应用 + BrandingCard UI + e2e + 8 语言。
5. **W5 静态资产**：favicon 生成脚本 + 7×2 PNG 产物 + theme-provider/index.html 接线。
6. **W6 真机验收**：16 组截图走查，修档位微调。

预计总量 2~2.5 天。W1–W4 为核心闭环（不 W5 也可发布，favicon 不跟随是已知限制）；W5/W6 补齐发布质感。

## 7. 风险与开放问题

- **风险：亮色 primary 明度差异**——flame L0.63 与 indigo L0.54 在同档位，视觉重量不同；Radix 已为白字对比调好各 hue，直接采信其值，真机走查兜底。
- **风险：暖调中性色**——背景中性色带 1% 暖调（hue 75），配冷色系可能有极轻违和。chroma 0.003–0.008 级别，v1 不动；真机确认违和再在预置块内同改中性 hue（同一文件，成本为零）。
- **开放问题 1**：8 套色样里 amber 的体验是加分还是鸡肋，真机见分晓；不达标则退 7 套。
- **开放问题 2**：预置名译文风格（「火焰/Flame」双语名 or 纯中文），做 i18n 时定。

## 附录：实施记录（2026-09-16）

与决策稿的差异与落地要点：

- **档位映射微调**：`--brand-50..300` 取 Radix light step 3/4/5/6，`--brand-400` 取 light step 8，`--brand-500..700` 取 step 9/10/11；coral 取 step 10（同 hue，保持 in-gamut）。amber 特例：600/700 取 step 11/12，`--brand-gradient-foreground` 与亮色 `--primary-foreground` 用深琥珀字。
- **新增 `--brand-gradient-foreground`**：CTA 渐变（Button brand 变体、日历今日圆点）的文字色独立于 `--primary-foreground`——flame 暗色的 CTA 现状是白字（`--primary-foreground` 是深字），直接跟随会把 flame 基线搞回归；amber 亮暗两态的渐变底都偏亮，单独覆盖为深字。
- **暗色特异块**：`.dark[data-accent='amber']` 恢复 `.dark` 的 `--primary-foreground`（预置块特异性 (0,2,0) 高于 `.dark` (0,1,0)，不补会被带进暗色）。
- **全站 `text-white` 清零**：Button brand、日历今日圆点改走 `--brand-gradient-foreground`。
- **BrandingCard**：色板直接放卡片内容区（免开编辑弹窗），点击即 PUT + 乐观应用（`setAccentAttribute`），swatch 用固定 hex。
- **favicon**：`apps/web/scripts/generate-accent-brand.mjs`（sharp）对现有 mark PNG 逐像素 oklch 色相旋转+色度缩放，产出 7×2 张到 `public/brand/<accent>/`；`theme-provider` 新增 `setFaviconAccent`，BrandingProvider 在 accent 生效时接线；`index.html` 陈旧 meta theme-color 初始值已顺手对齐。
- **e2e 归队**：branding.spec 之前没被任何 playwright 项目匹配（孤儿文件），已挂回 auth-ui 项目；accent 用例（选 jade→断言 html[data-accent]→匿名上下文持久→重置 flame）本地全绿。
- **验收**：16 组（8 预置×明暗）Playwright 截图走查（登录页 auth-frame + 合成 token 样本条：CTA/badge/switch/进度条/链接/焦点环/400/700 色块），flame 基线像素级无回归，amber 对比度问题在过程中发现并修复（button.tsx 的 text-white 是唯一硬编码白字）。

## 附录 2：自定义种子色（2026-09-16 二期）

决策稿原定「预置起步、种子色进阶」，同日完成二期。交互：

- 色板第 9 格为「自定义」：未激活时显示彩虹锥形渐变，激活后显示当前种子色。点击打开弹窗，内含原生取色器（`input[type=color]`，桌面端带吸管）+ 6 位 hex 输入框。
- **输入即预览**：合法 hex（支持 3/6 位）输入后全站立即重绘（`setAccentAttribute("custom", hex)`）；持久化防抖 600ms，关弹窗 flush 未保存的合法草稿。
- **推导器** `apps/web/src/lib/brand-ramp.ts`：种子只贡献 hue+chroma，L 走 flame 轨道固定值（0.96→0.47），每档色度按 flame 曲线比例缩放并做 sRGB gamut 钳制（二分 maxChroma）；前景色按 WCAG 对比度对**渲染后**色值自适应（白字为默认，亮底才翻深字）。固定 L 轨道保证任何色相的实底都是中调（实测 24 色相全扫白字对比 ≥3），因此白字普适，与 flame 基线观感一致。
- **服务端**：accent 枚举加 `custom`，新增 `accent_hex`（`#[0-9a-fA-F]{6}` 大小写不敏感，存小写）；`accent=custom` 必须带合法 hex，`accent≠custom` 时 hex 必须为 null；hex 单独 PUT 只在当前已是 custom 时生效。非法/缺 hex 的 custom 读取时回落 flame。
- **应用**：BrandingProvider 检测 custom+hex 后把 9 档色阶 + coral + `--brand-gradient-foreground` 以 inline style 写入 html（inline 优先级高于预置块），两个主题相关的 `--primary-foreground` 走 CSS 槽位 `--brand-custom-fg-light/dark`（inline 无法按主题切换）。切回预置时清全部 inline 变量。
- **边界**：favicon 对 custom 保持 flame 默认图（无法预渲染任意色）；无新依赖（oklch 数学为纯手写，与 favicon 脚本同源）。
- 验证：ramp 单测 9 条（含退化种子/AA 对比度矩阵/24 色相扫描）、domain+worker accent 测试绿、构建绿。e2e（custom 种子持久化）已写入 branding.spec，按 opt-in 规则未跑。
