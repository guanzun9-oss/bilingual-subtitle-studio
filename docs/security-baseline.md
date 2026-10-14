# 依赖安全基线

核查时间：2026-10-15（上海时区），Node.js 22.23.3 / npm 10.9.4。

## 已修复

原生产依赖图有 6 个受影响包（1 critical、4 high、1 moderate）。升级并重新生成锁文件后，`npm audit --omit=dev` 的各级别告警均为 **0**。

| 包 | 锁定的修复版本 |
| --- | --- |
| next / eslint-config-next | 16.4.0 |
| react / react-dom / react-server-dom-webpack | 19.2.8 |
| sharp | 0.35.5 |
| postcss | 8.5.23、8.5.30 |
| nanoid | 3.3.20 |
| source-map-js | 1.2.2 |
| baseline-browser-mapping | 2.11.28 |

此外更新了 Cloudflare Vite 插件、Wrangler、Vite 和 Drizzle Kit 的兼容版本。保留当前 vinext API，并在 `package.json` 中限定两个传递依赖覆盖：

- vinext 的 image-size 使用 2.0.4，修复恶意图片导致的无限循环；[上游公告](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)。
- @esbuild-kit/core-utils 的 esbuild 使用 0.25.12，修复旧开发服务器的跨站访问问题；[上游公告](https://github.com/advisories/GHSA-67mh-4wv8-2f99)。

React 服务端组件升级到 19.2.8，处理原生产分类检查未包含的服务端函数拒绝服务问题；[上游公告](https://github.com/advisories/GHSA-wx67-qw84-cm4g)。

`npm run check` 和 GitHub 的 quality 检查现在包含生产依赖审计，中危及以上告警将阻止检查通过。实际运行测试覆盖生产 Worker 的页面、输入校验、译文返回、凭据错误和禁用缓存，翻译服务使用模拟响应。

## 上游仍未提供补丁的开发依赖

完整 `npm audit` 从 32 个受影响包降至 8 个 high、0 critical、0 moderate、0 low。剩余 8 个均来自 **同一条 braces 3.0.3 公告**，包含依赖传播的计数：braces、micromatch、fast-glob、@next/eslint-plugin-next、eslint-config-next、vite-plugin-dynamic-import、vite-plugin-commonjs、vinext。

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 明确记录暂无已发布补丁。这些链用于代码检查和构建；本应用没有将上传字幕作为 glob 模式交给这些工具。告警仍保留在完整 audit 和 GitHub Dependabot 中，未添加忽略项、未降级工具或修改包版本来掩盖告警。

后续有兼容的上游补丁时，应移除相关覆盖或升级依赖，再执行干净安装、完整检查和完整 audit。当前记录描述仓库锁定依赖；生产部署另按 [发布流程](releasing.md) 执行。
