import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "subtitle-workflow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL("../scripts/", import.meta.url), join(root, "scripts"), { recursive: true });
  cpSync(new URL("../.githooks/", import.meta.url), join(root, ".githooks"), { recursive: true });
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "global.gitconfig") };
  delete env.CI;
  const run = (command, args, overrides = {}) => spawnSync(command, args, {
    cwd: root, encoding: "utf8", env: { ...env, ...overrides },
  });
  assert.equal(run("git", ["init", "--quiet"]).status, 0);
  return { root, run, node: (script, args = [], overrides = {}) => run(process.execPath, [`scripts/${script}.mjs`, ...args], overrides) };
}

test("Git setup is repeatable and changes only the checkout configuration", (t) => {
  const f = fixture(t);
  for (let count = 0; count < 2; count += 1) {
    const result = f.node("setup-git");
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(f.run("git", ["config", "--local", "--get", "core.hooksPath"]).stdout.trim(), ".githooks");
  assert.equal(f.run("git", ["config", "--local", "--get", "pull.ff"]).stdout.trim(), "only");
  assert.equal(f.run("git", ["config", "--global", "--get", "core.hooksPath"]).status, 1);
});

test("Git setup preserves an existing custom hooks path", (t) => {
  const f = fixture(t);
  assert.equal(f.run("git", ["config", "--local", "core.hooksPath", "existing-hooks"]).status, 0);
  assert.notEqual(f.node("setup-git").status, 0);
  assert.equal(f.run("git", ["config", "--local", "--get", "core.hooksPath"]).stdout.trim(), "existing-hooks");
  assert.equal(f.run("git", ["config", "--local", "--get", "pull.ff"]).status, 1);
});

test("Git setup leaves CI checkouts untouched", (t) => {
  const f = fixture(t);
  assert.equal(f.node("setup-git", [], { CI: "true" }).status, 0);
  assert.equal(f.run("git", ["config", "--local", "--get", "core.hooksPath"]).status, 1);
});

function releaseFixture(t) {
  const f = fixture(t);
  const write = (path, value) => writeFileSync(join(f.root, path), value);
  write("package.json", JSON.stringify({ version: "1.2.3" }));
  write("package-lock.json", JSON.stringify({ version: "1.2.3", packages: { "": { version: "1.2.3" } } }));
  write("CHANGELOG.md", "# Changelog\n\n## Unreleased\n\n- Future\n\n## v1.2.3 — 2026-10-15\n\n- Fixed subtitles\n\n## v1.2.2 — 2026-10-01\n\n- Older change\n");
  return { ...f, write };
}

test("release notes select exactly the tagged version and exclude other versions", (t) => {
  const f = releaseFixture(t);
  const result = f.node("release-notes", ["v1.2.3"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "- Fixed subtitles");
});

test("release validation rejects a wrong tag or a mismatched lockfile", (t) => {
  const f = releaseFixture(t);
  assert.notEqual(f.node("release-notes", ["v1.2.2"]).status, 0);
  assert.notEqual(f.node("release-notes", ["v1.2.3-rc.1"]).status, 0);
  f.write("package-lock.json", JSON.stringify({ version: "1.2.2", packages: { "": { version: "1.2.2" } } }));
  assert.notEqual(f.node("release-notes").status, 0);
});

test("release validation rejects missing or empty release notes", (t) => {
  const f = releaseFixture(t);
  f.write("CHANGELOG.md", "# Changelog\n\n## Unreleased\n\n- Future\n");
  assert.notEqual(f.node("release-notes").status, 0);
  f.write("CHANGELOG.md", "# Changelog\n\n## v1.2.3 — 2026-10-15\n\n## v1.2.2 — 2026-10-01\n\n- Older change\n");
  assert.notEqual(f.node("release-notes").status, 0);
});
