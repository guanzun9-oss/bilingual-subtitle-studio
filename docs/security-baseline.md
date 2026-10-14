# 依赖安全基线

核查时间：2026-10-15（上海时区）。在 Node.js 22.23.3 / npm 10.9.4 的干净环境，使用当前 `package-lock.json` 安装后执行 `npm audit --omit=dev --json`。

生产依赖图共有 6 个受影响包：1 critical、4 high、1 moderate。下表记录首次启用安全流程时的待处理项；后续以实时 audit 和 GitHub 安全提醒为准。

| 优先级 | 包 | audit 级别 | 处理方向 |
| --- | --- | --- | --- |
| P0 | next（当前 16.2.6） | critical | 评估升级到 audit 建议的 16.4.0，并验证 vinext 兼容性、页面渲染和 Worker 构建 |
| P1 | sharp | high | 随 Next.js 升级核对原生图像依赖及传递版本 |
| P1 | postcss | high | 升级修复版本，核对 Next.js 内嵌依赖 |
| P1 | nanoid | high | 更新允许范围内的传递依赖 |
| P1 | source-map-js | high | 更新到修复版本并验证构建 |
| P2 | baseline-browser-mapping | moderate | 更新允许范围内的传递依赖 |

告警来自依赖版本匹配，不等于已证实线上产品可以被利用。当前使用 vinext / Cloudflare Worker，仍需结合实际执行路径核查 Next.js 告警；不能据此忽略 critical 和 high 级别问题。

依赖修复应通过独立 PR，保持 Next.js 与 eslint-config-next 版本兼容，执行完整检查并核对 audit 结果。不要用 `npm audit fix --force` 跳过兼容性评估。此次流程配置没有升级应用依赖，也没有重新部署线上产品。
