# 安全问题

当前维护版本为最新发布版本。修复会通过新版本发布，建议及时更新。

请通过 [GitHub 私密漏洞报告](https://github.com/guanzun9-oss/bilingual-subtitle-studio/security/advisories/new) 联系维护者。若该入口不可用，请先在普通 Issue 中只请求私密沟通渠道，不公开漏洞细节、API Key 或私人字幕。

报告请说明受影响版本、最小复现步骤、实际影响和脱敏证据。误提交密钥时应立即撤销并重新生成；删除提交中的文字不能使已经泄露的密钥恢复安全。

维护者应关注 [Dependabot 安全提醒](https://github.com/guanzun9-oss/bilingual-subtitle-studio/security/dependabot)，并定期运行 `npm audit --omit=dev`。新依赖或版本更新的 PR 需要评估安全告警与运行兼容性。当前已知依赖问题及处理顺序见 [安全基线](docs/security-baseline.md)。
