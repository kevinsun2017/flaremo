# 个人笔记与团队笔记的空间模型（Space）实施稿

> 状态：**已实现**（2026-09-15，4 个批次全部落地：contracts/domain space 参数、
> 侧栏空间区与卡片身份、composer 发送目标选择器、stats/tags/语义搜索 space 化；
> 单测与 e2e 全绿）。本文是 [team-mode.md](./team-mode.md) 的 UX 续篇：
> 团队权限模型已落地（角色迁 organization、`memos.team_id`、行级过滤统一），本文解决
> 「界面如何呈现个人与团队两个世界」的信息架构问题。

## 问题

当前 Web 端只有一条时间线，个人笔记、团队笔记、全站公开笔记混在一起；侧栏统计、
标签树也全是混合口径。用户缺少「这是我的东西 / 这是团队的产出」的控制感，而且
**创建团队笔记的入口是断的**：编辑器默认 visibility 硬编码为 `private`
（`use-new-memo-capture.ts`），界面上没有可见性选择器，发团队笔记只能先发个人、
再去分享弹窗里改。

## 设计原则

> **归属在创建时决定，阅读按空间组织。**

- 笔记归属已经是存储事实：`team_id` 为空 = 个人空间，非空 = 团队空间。
  这与语义搜索的向量 namespace（个人 / 团队）一一对应，可见性变更时向量在两个
  namespace 间搬家——**空间模型直接复用这条既有轴线**，不引入新概念。
- 界面把这条轴线呈现为侧栏的一等导航「空间」，而不是时间线上的过滤参数：
  用户「进入」一个空间，而不是在混排流里「筛选」。
- 后端只造一个 `space` 概念，list / stats / tags / 语义搜索共用；
  前端 query layer 收口传递，各功能不得各自推导 scope。

## 空间语义

| space | 数据范围 | 说明 |
| --- | --- | --- |
| `all`（默认） | 现行 `memoReadScope` 全量 | 自己全部 + 团队 protected + 全站 public，行为不变 |
| `personal` | `team_id IS NULL` | 仅作者本人（自动满足 `user_id = me`，无需信任客户端） |
| `team` | `team_id = 本人组织 AND visibility ∈ {protected, public}` | 团队共享的笔记（含自己发到团队的）；admin 可见性/治理范围仍由 `memoReadScope` 兜底 |

语义判定规则（写进 domain 测试的口径）：

- **自己的 protected/public 笔记属于团队空间，不属于个人空间**——它们已被共享，
  `team_id` 非空，与向量 relocate 逻辑同构。
- `space` 与 `state`（normal/archived/trashed）正交组合：
  个人空间的归档/回收站即现状；团队空间的归档/回收站仅对 admin/owner 非空
  （成员查询天然为空集，不需要特判）。
- 无团队（未加入组织）的 viewer 请求 `space=team` 返回空列表（`0 = 1` 行级过滤），
  前端则直接不渲染团队空间入口。
- 未登录访客只出现在分享/公开路径，不接触 workspace，`space` 参数对其无意义。

## 明确不做（非目标）

- 不做 `/team` 独立路由树或双入口应用（当前每人只有一个团队，撑不起维护成本）；
- 不做多团队、组织切换器（`organizations` 表天然支持，未来按空间列表扩展即可）；
- 不改 Memos-compatible 端点（`/api/v1/memos`、current RPC）——legacy 路由显式
  剥离 `space` 参数，契约零感知；`space` 只在 `/api/app/*` 生效，全部可选参数。
- 日历、每日回顾、随机漫步暂不接 space（它们以个人任务/个人写作为主体；
  团队共享任务清单已拍板为远期候选并维持个人私有，触发条件与决策记录见
  `product-requirements.md`「决策记录 · D4」）；
- SSE、通知不感知 space。

## 分批实施

每批独立可部署（手动 `wrangler deploy`，门禁全绿后先滚 kosx），批内不分批。

### 批次 1：后端 space 贯穿（仅 list）

1. `packages/contracts/src/memos.ts`：`listMemosQuerySchema` 增加
   `space: z.enum(["all", "personal", "team"]).optional()`；`ListMemosQuery` 类型随之更新。
   （openapi 文档只描述 Memos-compatible 的 `/api/v1` 面，`/api/app` 无 openapi，无需改动。）
2. `packages/domain/src/team-permissions.ts`：新增
   `spaceScope(user, space): SQL | null`，返回 `personal`/`team` 的行级过滤
   （见上表口径），`all` 返回 null。签名使用 `TeamViewer`，无团队时 team 分支
   返回 `0 = 1`。
3. `packages/domain/src/memos.ts` `listMemosForViewer`：将 `spaceScope` 与
   `memoReadScope` AND 进 filters；CEL filter、FTS、分页、scan-limit 逻辑不动。
4. `apps/worker/src/routes/app-api.ts`：`/memos` 校验器透传 `space`。
5. 测试：domain 单测覆盖矩阵（space × state × 角色 × 无团队 viewer × 匿名），
   重点断言：personal 永不含团队笔记；team 对 member 不含归档/回收站；
   无组织 viewer 的 team 恒空。

### 批次 2：前端空间区 + 卡片身份

1. 路由：`index-route.tsx` `validateSearch` 增加 `space`
   （枚举校验，缺省 `all`）。遵循 TanStack Router 既有 search 接线模式，
   导航 owner 唯一，避免 search 循环崩溃家族问题。
2. `App.tsx`：`memosQuery` 的 queryKey 与请求参数带上 `space`。
3. 侧栏 `flaremo-explorer.tsx`：`navItems`（时间线/归档/回收站）上方新增
   「空间」段：

   ```
   空间
     全部           128   ← 默认，现行行为
     个人空间         96
     团队空间         32   ← 无团队则整段入口隐藏
   ```

   选中态、计数徽标样式与现有 nav 一致；space 与 view（归档/回收站）正交，
   切空间不清空 view/tag/q。
4. 会话载荷：`CurrentFlareMoUser` 增加团队信息（组织名称 + 是否有团队），
   侧栏用它决定渲染团队入口并显示团队名。
5. 卡片 `memo-card.tsx`：
   - 团队笔记统一显示作者（自己的团队笔记显示「我」），他人笔记已有
     `creator_name`，补齐自己的情况；
   - 团队笔记卡片左侧加团队色条（与 pinned 的 brand 色条同位异色），扫一眼可辨；
   - 现有 `VisibilityBadge`（盾牌/地球）保留。
6. i18n：`i18n/messages/{zh-CN,en-US,ja}.ts` 新增空间段与卡片文案；遵守文案卫生
   （不得出现 Memos 品牌名，一个视觉内不得重复标题）。
7. e2e：新增空间切换用例（切换后计数变化、URL 还原、tag/q 保留）；
   现有 46 条 e2e 不受影响（默认 space=all 行为不变）。

### 批次 3：编辑器可见性选择器（打通创建路径）

1. `MemoComposer` 发送按钮旁加「个人 / 团队」目标选择，默认跟随当前所在空间，
   用户改选后按空间分别持久化到 localStorage；
   「全网公开」仍只走分享弹窗（维持既定：发布默认仅自己可见 + 公开二次确认）。
2. `useNewMemoCapture` 的 `initialVisibility` 改由 WorkspaceComposer 传入：
   当前空间为团队 → `protected`，否则 `private`；无团队的 viewer 团队选项隐藏。
3. 草稿恢复：`MemoCaptureInput.visibility` 已持久化，恢复逻辑无需改动。
4. e2e：团队空间发送 → 卡片出现在团队空间；个人空间发送默认 private。

### 批次 4：stats / tags / 语义搜索按 space 收口

1. `memoStatsQuerySchema`、tag hierarchy（`/api/app/tags`）、
   `semanticMemoSearchQuerySchema` 均增加可选 `space`。
2. domain 侧：
   - `getMemoStats` / `listTagHierarchy` 的 `userId = me` 过滤替换为
     `scopedReadScope`（`memoReadScope + spaceScope` 组合）。口径统一规则：
     **全部 = 可读语料（own + team + public）**，个人 = 仅个人空间，
     团队 = 团队可读语料。侧栏统计、热图、标签树、统计计数全部跟随当前空间。
     不传 `space` 保持历史 own-only 语义（Memos-compatible 的
     GetUserStats/GetInstanceStats 依赖它，零变化）。
   - `memoSearchNamespaces`（`embedding.ts`）接受 space：
     all → 个人+团队双 namespace，personal → 仅个人，team → 仅团队；
     `solo` 部署全部索引在用户 namespace，任何 space 都扫它。
3. 前端：`statsQuery` / `tagHierarchyQuery` 带上 space；侧栏三个空间入口的
   计数徽标由一次 stats 调用返回的分组计数渲染
   （`memoStatsResponseSchema.counts` 增加 `spaces: { personal, team }` 正常态总数），
   避免三次请求。
4. 每日回顾、日历、随机漫步等 personal 语义页面维持原状（非目标）。

## 风险与对策

- **D1 索引**：`team` 走既有 `memos_team_visibility_status_idx`；
  `personal` 的 `team_id IS NULL` 过滤上线前用 `EXPLAIN QUERY PLAN` 验证走索引，
  不走则考虑 `(user_id, team_id)` 组合索引（迁移 0020 已有
  `memos_team_visibility_status_idx`，预计足够）。scan-limit 语义不变。
- **团队空间统计成本**：team 口径的 counts/热图/标签树是团队级聚合，
  单部署单团队、规模小，接受实时计算；如超预期再考虑 stats 缓存（D1 缓存评估
  的 identity TTL 模式可复用）。
- **兼容**：全部为 `/api/app` 增量可选参数；Memos-compatible 契约与既有客户端
  （Obsidian memos-sync 等）零感知。
- **语义搜索降级**：`degraded: true` 路径不受影响（namespace 列表为空集时直接
  返回空结果，与 provider/index 缺失同等处理）。

## 验收

以 owner、普通成员 A、无团队单用户账号验证：

- 默认进入工作区 = 现行混排时间线，行为与现状完全一致（回归零）；
- 个人空间只出现本人笔记（含自己归档/回收站的个人笔记），绝无团队笔记；
- 团队空间出现团队 protected 笔记与自己发到团队的笔记；成员 A 在团队空间的
  归档/回收站视图为空，admin 非空；
- 无团队账号侧栏无团队空间入口，API 返回空集不报错；
- 团队空间下用编辑器发送，新笔记直接出现在团队空间并可见于成员 B；
  个人空间下发送默认 private；
- 切换空间后 URL 可还原（刷新、分享链接）；tag/q 保留；
- 侧栏统计、热图、标签树随空间切换口径一致；
- 语义搜索：personal 只搜个人 namespace，team 只搜团队 namespace；
- `/?space=team&state=archived` 等组合对成员/管理员的行为与权限矩阵一致；
- Memos-compatible API 回归：现有 46 条 e2e 全绿。
