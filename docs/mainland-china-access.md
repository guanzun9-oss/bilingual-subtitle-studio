# 中国大陆访问方案

## 现状

在线工具部署在 Cloudflare Workers，地址为 `bilingual-subtitle-studio.guanzun9-tools.workers.dev`。`*.workers.dev`（以及 `*.pages.dev`）在中国大陆长期受到 DNS 污染和 SNI 阻断，大陆用户不借助代理通常无法打开。

应用本身已经适合大陆访问，不需要改前端：

- 页面使用系统字体，不加载 Google Fonts、公共 CDN 或第三方统计脚本；
- 浏览器只请求同源的 `/api/translate`，由 Worker 在服务端调用 DeepSeek；
- 分享图地址由请求的 Host 生成，换域名后自动跟随。

因此问题只在域名和线路，解决方法是给 Worker 绑定自己的域名，或换到大陆可达的节点。

## 方案 A：自有域名 + Cloudflare 自定义域名（推荐先做）

不需要 ICP 备案（服务器在境外），不需要迁移代码。域名可以先用免费的，之后再换成付费的（`.com` 约每年几十元人民币）。

1. **取得域名**，任选一种：
   - **免费**：用 GitHub 账号在 DigitalPlat FreeDomain 申请 `xxx.dpdns.org` 一类的免费域名。这类域名可能被平台收回或政策调整，也常被滥用而有被连带屏蔽的风险，适合先试用；申请前以其官网的当前规定为准。
   - **付费**：任一注册商均可，优先选 `.com`、`.net` 等常见后缀；部分廉价后缀在大陆的可达性较差。在国内注册商购买需要完成实名认证。
2. **托管到 Cloudflare**：在 Cloudflare Dashboard 添加站点（免费套餐即可），按提示把域名的 NS 服务器改成 Cloudflare 给出的两条，等待生效。
3. **绑定到 Worker**：任选一种方式。
   - Dashboard：Workers & Pages → `bilingual-subtitle-studio` → Settings → Domains & Routes → Add → Custom domain，填写如 `sub.example.com`。
   - 随部署绑定（推荐）：构建时设置 `CUSTOM_DOMAINS`，构建会把它写进 `dist/server/wrangler.json`，`wrangler deploy` 时自动绑定并签发证书。多个域名用逗号分隔，只填域名本身：

     ```bash
     CUSTOM_DOMAINS=sub.example.com npm run check
     ```

     ```bash
     npx wrangler deploy --config dist/server/wrangler.json
     ```

     域名需已在同一 Cloudflare 账户中生效；填写带 `https://`、路径、端口、通配符或 `workers.dev` 的值时构建会直接报错。
4. **验证**：用多地拨测工具（如 ITDOG、站长工具的多地 Ping/HTTP 测试）从大陆各省和不同运营商访问新域名，确认页面、SRT 下载和翻译接口都正常。

限制：Cloudflare 免费套餐在大陆没有节点，流量经境外节点回程，晚高峰可能较慢，个别地区或运营商偶有不稳定。对于本工具（页面轻量，主要耗时在翻译接口）通常够用。

## 方案 B：香港等境外近区节点

如果方案 A 的速度不够，可以把应用部署到香港等近区的服务器或边缘平台，仍然不需要备案，延迟一般低于方案 A。代价是要把运行环境从 Cloudflare Worker 迁移到 Node.js 服务或对应平台，并自行维护服务器与 HTTPS 证书。

## 方案 C：大陆节点 + ICP 备案

想要大陆用户获得最稳定、最快的访问，需要使用大陆服务器或大陆 CDN 节点，这必须先完成 ICP 备案：

- 需要已实名的域名，以及在提供备案服务的云厂商（如阿里云、腾讯云）购买的大陆资源；
- 个人可以为非经营性网站备案，审核一般需要一到数周；备案后页面底部需展示备案号；
- 同样需要把运行环境从 Cloudflare Worker 迁移到对应平台。

Cloudflare 自身的中国网络（China Network）仅向企业版客户开放，同样要求 ICP 备案，对本项目不现实。

## 建议顺序

1. 先做方案 A，成本最低、不改应用代码；
2. 用多地拨测确认效果，收集大陆用户反馈；
3. 速度或稳定性仍不满足时，再评估方案 B 或 C。

## 确定域名后需要同步修改的位置

- `README.md`：“打开在线工具”链接；
- `package.json`：`homepage`；
- `docs/releasing.md`：上线后检查的在线工具链接；
- `CHANGELOG.md`：在 Unreleased 中记录新的访问地址。

原 `workers.dev` 地址可以保留给海外用户，也可以在 Worker 设置中关闭。
