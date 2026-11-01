# Cloudflare 用量凭据改为前端配置（决策稿）

- 日期：2026-09-19
- 状态：**待拍板**
- 作者：ZCode（Omen Alpha），起因是 Kim 的产品批评：「为什么凭据不能通过前端配置？谁天天填环境变量？」
- 关联：`apps/worker/src/cf-analytics.ts`（现有实现）、`scripts/setup-usage.mjs`（现有引导脚本）、`docs/deploy.md`（配置章节，本稿落地后需改写）、`docs/asr-admin-settings.md`（同款先例）

---

## 0. 结论摘要

1. **5 个配置项里只有 1 个是真秘密**。`FLAREMO_CF_ANALYTICS_TOKEN` 之外的四项（账号 ID、worker 名、D1 id、R2 桶名）全是部署时已知、且不敏感的元数据，把它们做成 wrangler secret 并要求用户逐一填写是错的设计——把开发者的运维习惯当成了用户的配置流程。
2. **目标形态：用户在设置页粘贴一个 token，其余全自动**。设置 → 用量里未配置时显示引导卡：链接到 Cloudflare token 创建页 + 一个输入框 + 「验证并保存」。验证通过才落库，Cloudflare 的报错当场透传给用户。
3. **落库复用现成基建**：`integration_config` 表 + `secret-box` 加密信封（email / OAuth / 语音密钥已用同一套），零新表、零新安全机制。
4. `setup:usage` 脚本保留但降级为 IaC 快捷方式，文档主路径改为 UI。
5. 工作量约半天（worker 配置读写 + web 配置卡 + 8 语言文案 + 测试）。

## 1. 背景与动机

09-19 用量面板上线时，凭据配置走了「operator secret」路径：用户在终端跑 `pnpm setup:usage`，脚本引导去 Cloudflare dashboard 建 token，然后 `wrangler secret put` 写入 5 个 secret。

这条路径对**我们自己的实例**没问题（chendahuang 实例已用此路径完成），但站在自部署用户视角有两个硬伤：

1. **前提错位**。Deploy 按钮用户的画像是不想碰终端和仓库的站主；`setup:usage` 要求会跑 pnpm、有 wrangler 登录态、能进仓库目录。对他们来说这不是「高级可选」，这是「根本完不成」。
2. **认知错位**。面板显示的是「官方账单口径」，而配置它的方式却是「填环境变量」——用户视角里这两件事毫无关系。ASR 语音密钥已经证明了这个产品的正确形态：设置页里粘贴密钥，保存，完成。

「去 Cloudflare dashboard 建一次 token」这个动作**无法省掉**（Cloudflare 权限模型不允许任何已有凭据代铸新 token，wrangler OAuth 不行、管理员身份也不行——09-19 已实测）。本稿省掉的是其后的一切终端操作。

## 2. 现状盘点（审计结论）

| 件 | 现状 | 与本稿的关系 |
|---|---|---|
| `cf-analytics.ts` | 从 5 个 env secret 解析配置；分节容错；1h 缓存且缓存键含 token（换 token 不脏缓存） | 解析函数改为两级取值（见 §3.4），其余不动 |
| `/api/app/usage/cloudflare` | owner-only；未配置返回 `{available:false}` 前端隐藏区块 | 不动；配置态由新增的 config 端点管理 |
| `integration_config` 表 | `id`/`revision`/`enabled`/`ciphertext`，email 与 oauth 已用 | 直接复用，新 id `"cf-analytics"`；**零迁移** |
| `secret-box.ts` 信封 | v0 明文 JSON（D1 静态加密兜底）/ v1 AES-GCM + per-integration AAD；密钥 `FLAREMO_INTEGRATION_CONFIG_KEY`（回落 `FLAREMO_VOICE_CONFIG_KEY`） | 直接复用 |
| `integrations-card.tsx` 交互 | Dialog 表单 + 保存/测试/删除 + 掩码回显（`****后4位`）+ revision 防并发覆盖 + 密钥 write-only（全值永不回传前端） | 配置卡照抄此模式 |
| 权限中间件 | `canManageInstanceIntegrations` = owner-only；`rateLimitGuard`；`bodyLimit` | 直接复用 |
| `setup-usage.mjs` | whoami → secret list → 引导建 token → secret put ×5 → GraphQL 自检 | 保留；文档降级为可选 |

## 3. 方案

### 3.1 用户旅程（主路径）

1. 设置 → 用量：面板顶部多一张「Cloudflare 资源用量」状态卡。未配置时显示引导：**「去 Cloudflare 创建 API token」**链接（直达 `https://dash.cloudflare.com/profile/api-tokens`）+ 三步说明（Custom Token → 权限选「帐户分析 / 读取」→ 资源限本账号）。
2. 用户点「配置」，弹出 Dialog（同 email/OAuth 卡样式）：一个 token 输入框（PasswordInput 防偷窥）+「验证并保存」。
3. 后端拿 token 实打实发一条 GraphQL 查询（`viewer.accounts` 无过滤）：
   - **通过** → 若 token 可见唯一账号则自动锁定 accountId，封装落库，前端刷新后面板区块出现；
   - **失败** → Cloudflare 报错原文透传（「Authentication failed」「token 无 Account Analytics 权限」等），不落库。**绝不出现「存进去了但面板永远空白」。**
4. 已配置态：卡内显示掩码（`****后4位`）+ 上次验证账号 + 「重新配置」「移除」按钮。

### 3.2 元数据自动推导（用户只填 token 的支撑）

| 项 | 来源 | 兜底 |
|---|---|---|
| 账号 ID | 保存时用 token 调 `viewer { accounts }`（无过滤）；唯一账号自动锁定；多账号时 Dialog 里出现下拉让用户选（选择结果随 payload 存库） | 无——这是必填的推导产物 |
| worker 名 | 环境变量 `FLAREMO_CF_WORKER_NAME`（普通 var，非 secret）；缺省 `"flaremo"`（FlareMo 标准部署名） | 两个来源都空 → Workers 区块隐藏（现有分节容错语义） |
| D1 id | 环境变量 `FLAREMO_CF_D1_ID`（普通 var）；**可选增强**：GraphQL 侧 `d1AnalyticsAdaptiveGroups` 按 `databaseId` 维度分组，账号下只有一个活跃 D1 库时自动锁定（实施时先实测该 dataset 是否暴露此 dimension，官方 schema 里它是 filter+dimension 双角色） | 两来源都空 → D1 区块隐藏 |
| R2 桶名 | 环境变量 `FLAREMO_CF_R2_BUCKET`（普通 var）；**可选增强**：`r2OperationsAdaptiveGroups` 按 `bucketName` 分组做同款自动发现 | 两来源都空 → R2 区块隐藏 |

四项元数据从 wrangler secret 改为普通 `vars` 的理由：它们不敏感（账号 ID 出现在 dashboard URL 里、桶名/库名用户自己起的），且 Deploy 按钮用户本来就要编辑 wrangler.json 里的占位 UUID——把 id 顺手放进 vars 零额外成本，同时彻底解耦「换 token」与「重新部署」。

### 3.3 存储与安全

- 存 `integration_config`，id `"cf-analytics"`，payload `{ token: string, accountId: string }`，经 `sealIntegrationCredentials("cf-analytics", …)` 封装。推荐部署配 `FLAREMO_INTEGRATION_CONFIG_KEY` 得到 v1 AES-GCM 静态加密；未配则 v0 明文（D1 本身静态加密 + token 是只读 analytics 权限，风险可接受，UI 上提示可配密钥升级）。
- 取值顺序：**env secret（`FLAREMO_CF_ANALYTICS_TOKEN`，IaC 部署用）> D1 集成配置（UI 用）**。env 优先保证脚本/CI 用户的既定工作流不被 UI 覆盖搅乱；配置卡在 env 已配时显示「由部署环境变量接管，如需改为页面配置请先移除 env secret」。
- token write-only：config GET 只回掩码与状态，全值不出 worker（与 email apiKey 同契约）。
- 缓存键已含 token（`8d2870f`），UI 换 token / 移除 token 即时生效，无脏缓存问题。
- 端点全部 owner-only + `no-store` + `rateLimitGuard` + `bodyLimit(8KB)`；保存前 verify 用的查询本身也限频。

### 3.4 API 面（挂在现有 usage cloudflare 域下）

| 端点 | 行为 |
|---|---|
| `GET /api/app/usage/cloudflare/config` | 状态 + 掩码预览：`{ configured, source: "env" \| "db" \| "none", maskedToken, accountId, canEncrypt }` |
| `PUT /api/app/usage/cloudflare/config` | `{ token, accountId?, revision }` → 先 GraphQL 验证（唯一账号自动补 accountId），通过后 seal 落库（revision 乐观并发），返回新掩码 |
| `DELETE /api/app/usage/cloudflare/config` | 清 D1 配置（env 来源时返回说明不删库值） |

数据面 `GET /usage/cloudflare` 不变：`resolveAnalyticsConfig` 内部改为「env → D1 config → 无」三级。

### 3.5 顺手收口

- `docs/deploy.md`：配置章节改写为「主路径 = 设置页配置卡；脚本 = 可选 IaC 快捷方式」，secret 数从 5 降为 1（且非必需）。
- `scripts/setup-usage.mjs` 保留，输出文案同步指向 UI 主路径；它写的 4 个元数据 secret 继续被兼容读取（env 优先级最高），不强制迁移。
- wrangler.json（Deploy 按钮的零 UUID 占位版）：vars 注释里提示「用量面板的 D1/R2 元数据可写这里」，不强制。

## 4. 明确不做

- **不做 token 自动创建**。Cloudflare 权限模型封死了一切代铸路径（09-19 三身份 + wrangler OAuth 实测），任何「全自动」的承诺都是假的；UI 里把创建步骤的链接和说明做到最顺即是上限。
- **不做多 worker / 多库 / 多桶的精细归属推断**。同账号跑多个 Workers 时 scriptName 无法可靠归属到「本部署」，宁可区块隐藏也不猜错数。
- **不动数据面查询结构**。`cf-analytics.ts` 的三条查询、分节容错、缓存策略均保持（含 4de5add 的 dimensions 修复）。

## 5. 待拍板

1. **配置卡位置**：我的建议是放「用量」tab 顶部（配置和使用同屏，语义就是这块面板的一部分）；备选是「集成服务」tab 与 email/OAuth 并列（基建归类更整齐）。倾向前者，理由是用户在「用量」看到缺块时的下一步直觉就是就地配置。
2. **D1/R2 零配置自动发现做不做进首期**：建议首期只做「env var + 缺省」，自动发现（依赖 dataset dimension 实测）作为可选增强后置，避免半天工作量膨胀。

## 6. 工作量拆分

| 项 | 内容 | 预估 |
|---|---|---|
| worker | config 三端点（复用 email-settings 模板）+ `resolveAnalyticsConfig` 两级取值 + 单测 | ~2h |
| web | 用量 tab 状态卡 + Dialog + api 封装 + 8 语言文案（~12 键） | ~2h |
| 文档 | deploy.md 改写 + 本稿状态翻「已实施」 | ~0.5h |
| 验收 | mini local dev 目检（未配置→配置→换 token→移除四态）+ tsc + 定向 vitest | ~1h |
