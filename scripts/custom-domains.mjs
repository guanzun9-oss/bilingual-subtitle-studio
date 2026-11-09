/**
 * Turns the CUSTOM_DOMAINS build variable into Wrangler custom-domain routes.
 *
 * `*.workers.dev` is blocked in mainland China; binding the Worker to a domain
 * we control makes it reachable there. The value is a comma- or
 * whitespace-separated list of bare hostnames, e.g. "sub.example.com".
 */
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function customDomainRoutes(value = "") {
  const hosts = [...new Set(value.split(/[\s,]+/).filter(Boolean).map((host) => host.toLowerCase()))];
  for (const host of hosts) {
    if (!HOSTNAME.test(host)) {
      throw new Error(`CUSTOM_DOMAINS 中的 "${host}" 不是有效域名：只填写域名本身，例如 sub.example.com，不带 https://、路径、端口或通配符。`);
    }
    if (host.endsWith(".workers.dev")) {
      throw new Error(`CUSTOM_DOMAINS 不能使用 ${host}：workers.dev 地址由 Cloudflare 自动提供，需要填写自己的域名。`);
    }
  }
  return hosts.map((pattern) => ({ pattern, custom_domain: true }));
}
