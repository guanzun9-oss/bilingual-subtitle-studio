import { chmodSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

if (process.env.CI) {
  console.log("CI 环境不安装本地 Git hooks。");
  process.exit(0);
}

if (realpathSync(git("rev-parse", "--show-toplevel")) !== root) {
  throw new Error("请在本项目的 Git checkout 内运行 setup:git。");
}

const currentHooks = spawnSync("git", ["config", "--get", "core.hooksPath"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
if (currentHooks.error || ![0, 1].includes(currentHooks.status)) {
  throw new Error("无法读取当前 Git hooks 配置。", { cause: currentHooks.error });
}
const hookPath = currentHooks.stdout.trim();
if (hookPath && hookPath !== ".githooks") {
  throw new Error(`已有 hooks 路径 ${hookPath}，请先与 .githooks 的检查整合。`);
}

for (const hook of ["pre-commit", "pre-push"]) {
  chmodSync(fileURLToPath(new URL(`../.githooks/${hook}`, import.meta.url)), 0o755);
}
for (const [key, value] of Object.entries({
  "core.hooksPath": ".githooks",
  "pull.ff": "only",
  "fetch.prune": "true",
  "push.default": "simple",
  "push.autoSetupRemote": "true",
})) {
  git("config", "--local", key, value);
}
console.log("当前仓库 Git 配置与提交/推送检查已启用。");
