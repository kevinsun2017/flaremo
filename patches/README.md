# patches/ —— 本地改动在同步时的生命线

本仓库用 `upstream-sync.yml` 以**快照替换**方式同步上游 FlareMo（`rsync -a --delete` 上游整树）。
任何对上游已有文件的本地改动，都会在下次同步时被**静默还原**。

因此：凡改动上游已有文件，必须同时把改动登记为这里的 `.patch`，
同步工作流会在覆盖后 `git apply patches/*.patch`，**打不上就 exit 1**（PR 失败而非静默丢改动）。

## 生成/更新补丁

```bash
# 从 main 上的本地改动提交生成补丁（编号递增）
git format-patch -1 <commit-sha> --stdout > patches/0002-<name>.patch
# 本地验证能干净打上
git stash -u && rsync --dry-run >/dev/null; git apply --check patches/*.patch && echo OK
```

## 上游冲突时怎么办

1. 同步 PR 里看工作流日志，它会点名是哪个文件让补丁打不上
2. 本地 `git checkout -B rebase-patch upstream快照分支`，手工把改动重新贴到新代码上
3. 重新生成同名 patch 提交，PR 才能继续
