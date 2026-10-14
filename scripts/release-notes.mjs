import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const tag = process.argv[2] ?? `v${pkg.version}`;

if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${pkg.version}`) {
  throw new Error(`发布标签 ${tag} 必须等于 package.json 的 v${pkg.version}。`);
}
if (lock.version !== pkg.version || lock.packages[""].version !== pkg.version) {
  throw new Error("package.json 与 package-lock.json 的版本不一致。");
}

const changelog = read("CHANGELOG.md");
const headings = [...changelog.matchAll(/^## (.+)$/gm)];
const index = headings.findIndex(({ 1: heading }) => heading.startsWith(`${tag} — `));
if (index === -1 || !new RegExp(`^${tag.replaceAll(".", "\\.")} — \\d{4}-\\d{2}-\\d{2}$`).test(headings[index][1])) {
  throw new Error(`CHANGELOG.md 缺少 "## ${tag} — YYYY-MM-DD" 发布记录。`);
}

const start = headings[index].index + headings[index][0].length;
const end = headings[index + 1]?.index ?? changelog.length;
const notes = changelog.slice(start, end).trim();
if (!notes) throw new Error(`${tag} 的发布说明为空。`);
console.log(notes);
