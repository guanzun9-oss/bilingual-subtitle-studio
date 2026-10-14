# 开发与协作

项目采用短期分支、Pull Request 和 Squash 合并。`main` 应始终能通过完整检查；功能发布使用版本标签和 GitHub Release。

## 一次性设置

```bash
nvm install
nvm use
npm install --global npm@10.9.4
npm ci
npm run setup:git
```

不使用 nvm 时，安装 Node.js 22（至少 22.13.0）及 npm 10 以上。`packageManager` 记录团队使用的 npm 版本；依赖安装以锁文件为准。项目不需要 `.env`：DeepSeek API Key 由使用者在页面中输入。

`setup:git` 只修改当前仓库：启用 `.githooks`、拉取时只接受快进、推送当前分支、自动建立上游并清理已删除的远程分支。已有自定义 hooks 路径时会停止，避免覆盖。提交身份请在本仓库设置为自己的 GitHub 身份；公开仓库可使用 GitHub 的 noreply 邮箱。

## 每次开发

```bash
git switch main
git pull --ff-only
git switch -c codex/short-description
npm run dev
```

提交采用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:` 或 `chore:` 前缀，说明具体改动。一个 PR 处理一个问题，在描述中写明用户行为变化、验证结果和发布影响。不要把私人字幕或密钥作为复现附件。

## 质量检查

| 命令 | 用途 |
| --- | --- |
| `npm run check:quick` | 代码规范、TypeScript、无需构建的回归测试 |
| `npm run check` | 代码规范、TypeScript、生产构建、全部回归测试及页面渲染 |
| `npm run release:check` | 当前版本、锁文件和发布记录一致性 |

提交 hook 执行快速检查及暂存区空白检查；推送 hook 执行完整检查。Hook 检查的是当前工作区，提交前请整理好相关改动。GitHub 的 `quality` 检查对每个 PR 和 `main` 再执行相同的完整检查。只删除远程分支也会触发本地推送检查。

修改断句、时间计算或导出时，为具体行为补充回归样例；修改界面时检查桌面和手机布局，以及任务完成、失败和继续任务。现有渲染测试会检查生产 Worker 是否返回完整页面，不调用真实翻译 API。

默认主分支规则：要求 PR、`quality` 通过、分支保持最新、讨论已解决和线性历史；禁止强制推送和删除 `main`。个人维护阶段不强制第二个人审批；多人协作时可增加至少一位审核者。CODEOWNERS 标记当前维护者。

合并使用 Squash，合并后删除功能分支。依赖更新由 Dependabot 每周提出，仍需检查通过和人工评估；不自动合并或上线。

## 发布

用户行为变化先记录在 `CHANGELOG.md` 的 Unreleased 中。版本更新、标签、GitHub Release、Cloudflare 部署和回滚步骤见 [发布流程](docs/releasing.md)。

CI 配置遵循 [GitHub 官方 Node.js 工作流指南](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)，使用只读默认权限及固定的 Action 提交版本。
