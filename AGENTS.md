# 项目协作约定

- 本项目使用 npm 和 `package-lock.json`，Node.js 版本由 `.nvmrc` 指定。
- 先阅读 `CONTRIBUTING.md`；在 `codex/<简短名称>` 分支开发。
- 不覆盖用户已有改动；不重写已推送的历史。
- 提交前运行 `npm run check`。算法与翻译行为的修改应增加有意义的回归测试；界面修改需检查实际显示效果。
- 不提交 API Key、私人字幕、`.env*`、`tmp/`、`outputs/` 或构建产物。
- 用户行为变化写入 `CHANGELOG.md` 的 Unreleased；版本发布遵循 `docs/releasing.md`。
- 当前字幕规则：原始 Buzz 条目只拆分、不合并；有效非空译文不能因长度提示而被丢弃。维护现有回归覆盖。
