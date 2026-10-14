# 发布与回滚

## 准备版本

1. 确认计划发布的 PR 已合并，`main` 的 `quality` 检查通过。
2. 在新分支更新 `package.json` 与 `package-lock.json` 的版本（`npm version patch --no-git-tag-version`，或明确指定版本），并同步 README 的版本徽章和“当前版本”。
3. 将 Unreleased 中本次内容移动到 `## vX.Y.Z — YYYY-MM-DD`，日期采用上海时区；写明用户可见的变化和已知限制。
4. 运行 `npm run check` 和 `npm run release:check`，通过 PR 合并。

Patch 用于修复，minor 用于向后兼容的功能，major 用于不兼容变化。仍处于 0.x 阶段时，不兼容变化通过 minor 版本明确说明。

## 标签与 GitHub Release

从最新且干净的 `main` 为刚合并的发布提交创建标签；以下命令的版本号需替换为实际版本。

```bash
git switch main
git pull --ff-only
npm run check
npm run release:check
git tag -a vX.Y.Z -m 'Release vX.Y.Z'
git push origin vX.Y.Z
```

Release 工作流确认标签提交属于 `main`，重新运行完整检查，核对标签、包版本、锁文件版本和 CHANGELOG，然后根据该版本的更新日志创建 GitHub Release。不要移动或覆盖已经发布的标签。已有历史标签不需要重推。

## Cloudflare 上线

GitHub Release 创建成功后，由维护者执行部署。当前自动化不持有 Cloudflare 凭据；生产发布保留明确的人工操作。

```bash
npm ci
npm run check
npx wrangler deploy --config dist/server/wrangler.json
```

部署前确认当前 checkout 为待上线标签，生成配置中的 Worker 名为 `bilingual-subtitle-studio`，且 Wrangler 登录的是正确账户。保存 GitHub Release、提交 SHA 和 Cloudflare deployment/version ID，便于追溯。

上线后打开 [在线工具](https://bilingual-subtitle-studio.guanzun9-tools.workers.dev)，检查上传、断句、字幕布局和 SRT 下载；用维护者自己的 Key 做少量翻译，检查错误提示和继续任务。不把 Key 或字幕写入发布日志。

如发生线上回归，在 Cloudflare Dashboard 的该 Worker 部署历史中恢复上一已验证版本，记录故障与回滚的 version ID。随后通过修复 PR 发布新版本。代码状态也需要回退时，使用 `git revert` 创建可审查的提交，保留发布历史。
