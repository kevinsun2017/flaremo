# 内容编辑权决策稿——没人能改写别人的原话

> 状态：**已实现，待合并**（2026-09-17 Kim 拍板方向，同日在 `feat/content-authority` 分支落地；typecheck 与 domain/worker/memos/contracts/web 套件全绿，验收口径见第 6 节）。
> 前置定调：09-15 团队权限模型重构（36c314b，已部署 kosx）——治理/编辑拆分、角色在 Better Auth organization、个人笔记零例外。本文档是那次拆分的**收尾一步**：把「编辑权」从 owner 手里也收回来。
> 原则约束：「简约不简单，克制不放肆」——权限面越克制越好；**作者主权**优先于运维便利。

核心结论：**改写别人的原话是作者权，删除是治理权，两者必须彻底分离。** 当前模型里 owner 对同组织他人团队笔记（protected/public）拥有编辑内容/改可见性/置顶的权力，这是不对的——笔记产品的底线是「没人能篡改别人写下的字」。Owner 收窄为只能**治理**（归档/回收站/恢复）与**彻底删除**（不可逆兜底），与 admin 的差别只剩成员管理和硬删。私人笔记的零例外边界不变。

---

## 1. 背景：现状与问题

09-15 重构立了「治理/编辑拆分」的防线：admin 只能拿下（归档/回收站/恢复），不能改写；编辑权当时同时给了作者和 owner。代码事实（`packages/domain/src/team-permissions.ts`）：

```ts
export function canEditMemo(user, memo) {
  if (memo.userId === user.id) return true;
  return isTeamOwner(user) && memo.teamId !== null
      && memo.teamId === user.teamOrganizationId;   // ← 问题就在这一支
}
export const canDeleteMemo = canEditMemo;           // ← 硬删被编辑权连坐
```

问题：owner 对他人团队笔记可以静默改写内容、改可见性、置顶。虽然改动会进修订历史（`revisions.ts`，非无痕），但「事后可审计」救不了「事前不该有」——删掉重发、归档下架都是显式的治理动作，**原地改写别人的字没有任何正当场景**。对被改的作者来说，这和被黑了没有区别。

防线有半条是立住的：admin 本来就没有编辑权（治理/编辑拆分），admin 也没有硬删（只能回收站，30 天 TTL 后 cron 清）。真正越界的只有 owner 这一支。

## 2. 目标权限矩阵

| 能力 | 本人 | member（看他人团队笔记） | admin | owner |
|---|---|---|---|---|
| 编辑内容/payload/置顶 | ✅ | ❌ | ❌ | **❌（现状 ✅，收回）** |
| 改可见性 | ✅ | ❌ | ❌ | **❌（现状 ✅，收回）** |
| 附件/关系/分享/修订恢复 | ✅ | ❌ | ❌ | **❌（现状 ✅，收回）** |
| 归档 / 回收站 / 恢复（治理） | ✅ | ❌ | ✅ | ✅ |
| 彻底删除（硬删） | ✅ | ❌ | ❌（现状即如此） | ✅（保留，解耦） |
| 改角色 / 成员管理 | ❌ | ❌ | 部分（平级保护） | ✅ |
| 个人笔记（private） | ✅ | ❌ | ❌ | ❌（零例外，不动） |

一句话版本：**admin 与 owner 都不能改写别人的字；admin 能拿下不能清底，owner 能拿下也能清底。** Owner 与 admin 在内容维度上只差一个硬删。

### 为什么「删除可以、编辑不行」是自洽的

- 删除是**减法**：内容从时间线消失，但删除这个事件本身可见（SSE/webhook 都发 `memo.deleted`），且回收站路径可恢复（30 天 TTL）。删除不产生「作者没写过的话」。
- 编辑是**加法/替换**：改完之后时间线上挂着的是作者没写过的字，署名还是作者。即使有修订历史兜底，第一条防线不该存在。
- 下架公开内容的正路是回收站（显式、可恢复、留痕），不是悄悄改成 private 或改写内容。可见性收进编辑权后，owner 的治理工具箱 = 归档/回收站/恢复/硬删，够用。

## 3. 改造点清单（实现时照此执行）

1. **`team-permissions.ts`**：
   - `canEditMemo` 删掉 owner 分支，收窄为仅作者（注释同步改写：编辑权=作者权，无任何例外角色）。
   - `canDeleteMemo` 与 `canEditMemo` **解耦**：`own || (isTeamOwner && teamId 非空且 == 本人组织)`。不再用 `export const canDeleteMemo = canEditMemo` 别名。
   - `canGovernMemo`、`memoReadScope`、`spaceScope`、`canReadMemo` 全部不动。
2. **`memos.ts`**：`updateMemo` 的注释（"the author (and the team owner) edit"）改成作者独占；`hardDeleteMemo`/`moveMemoToTrash` 逻辑不变，只是权限来源变了。
3. **`revisions.ts`**：修订**恢复**（写路径）保持 `assertCanEditMemo` → 自动变成作者独占，正确。修订**读取**当前也被 `assertCanEditMemo` 挡着 → 见决策点 D2。
4. **前端**：`can_manage`/`can_govern` 两个服务端位（app-api.ts:280、memos/adapter.ts:113）是同源派生，服务端收窄后 memo-card 菜单自动收——owner 看他人笔记将只剩治理项。前端无需主动改动，走查确认即可。
5. **测试**：`team-permissions.test.ts` 里「owner 可编辑他人团队笔记」的正例翻成负例；新增「admin 不可硬删」「owner 不可编辑但可硬删」断言；受影响的 memos/memo-context/revisions 用例同步翻面。仍用 `test-support.ts` 的 `ensureTeamOwner`/`createTeamMember` 走生产路径。

## 4. 决策点（默认推荐已写明，实现前过目即可）

- **D1 硬删是否也放给 admin**：**不放**。现状 admin 就没有硬删，且回收站 30 天 TTL 已经给了 admin 变相清底的路径；硬删维持 owner 独占，作为不可逆操作的问责层。与现状一致，零额外改动。
- **D2 修订历史读取**：**放宽到治理层**（admin+，含 owner，限同组织团队笔记）。修订历史在治理场景有审计价值（「这篇笔记原来写了什么」）；读取历史版本不超出 admin 已有的当前内容读取权多少。恢复修订仍作者独占。若嫌一刀切麻烦，也可以保持作者独占（owner/admin 看不了他人修订），功能上无洞，仅审计体验差些。**推荐放宽**。
- **D3 Memos API 兼容语义**：Memos 上游 host 可改任何人的 memo，我们**刻意偏离**。OpenAPI/MCP 的 Memos-compatible 契约描述只关乎 API 形状（字段/路由），行为收窄不违背它，`memos-compatibility.md` 不用改；如需备注可在该文档加一行「编辑权 = 作者权，与上游 host 全权语义不同」。

## 5. 边界情况核对（均已推演，无断层）

- **离队认领**：成员被移出时其团队笔记 UPDATE `userId=owner` → 变成 owner 自己的笔记 → 走本人路径照常编辑。认领流程不依赖「owner 可编辑他人笔记」，不受影响。
- **可见性收窄后的下架路径**：owner 想下架某篇 public 笔记 → 回收站（可恢复，30 天 TTL）→ 需彻底清除走硬删。不能也不需要「改 private」这种静默手段。
- **多组织**：编辑/删除/治理全部仍锁 `memo.teamId === user.teamOrganizationId`，跨组织零权力（808dded 修的边界不回退）。
- **附件/关系/分享**：挂 `assertCanEditMemo` → 全部自动作者独占。owner 不能往别人笔记里塞附件、建分享链——均属内容行为，收窄正确。
- **SaaS 多用户语义**：本改动对单团队自部署与 SaaS 共享实例同样成立；免费档/共享实例下 owner=实例方，作者主权保护正是多租户下最需要的。

## 6. 验收口径

按既定敏捷节奏：`tsc` + 定向 vitest（team-permissions / memos / memo-context / revisions / shares / attachments / relations）+ build + dev 目检（owner 视角看他人笔记菜单只剩治理项）。Playwright 仅在 Kim 明确要求时跑。门禁全量 `pnpm verify` 不跑（opt-in）。

实现完成后 kosx 滚动走常规部署流程。
