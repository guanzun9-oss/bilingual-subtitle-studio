import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/subtitle-tool.tsx", import.meta.url);

test("task UI exposes progress and both recovery actions", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /role="progressbar"/);
  assert.match(source, /已完成[\s\S]*?translatedCount/);
  assert.match(source, /继续任务/);
  assert.match(source, /重新开始/);
  assert.match(source, /translate\(true\)/);
});

test("preview renders every prepared subtitle", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /tidy\.map\(/);
  assert.doesNotMatch(source, /tidy\.slice\(0,\s*12\)/);
  assert.doesNotMatch(source, /预览前 12 条/);
});

test("translation recovers malformed batches without losing progress", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /batch\(pending,\s*12\)/);
  assert.match(source, /async function translateBatch/);
  assert.match(source, /remaining\.slice\(0, middle\)/);
  assert.match(source, /remaining\.slice\(middle\)/);
  assert.match(source, /onProgress\?\./);
});
