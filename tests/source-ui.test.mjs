import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/subtitle-tool.tsx", import.meta.url);

test("task UI exposes progress and both recovery actions", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /role="progressbar"/);
  assert.match(source, /t\.doneCount, \{ done: translatedCount/);
  assert.match(source, /t\.continueCount/);
  assert.match(source, /t\.restart/);
  assert.match(source, /translate\(true\)/);
});

test("preview renders every prepared subtitle", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /tidy\.map\(/);
  assert.doesNotMatch(source, /tidy\.slice\(0,\s*12\)/);
  assert.doesNotMatch(source, /预览前 12 条/);
});

test("translation uses the tested batch queue and saves progress as it arrives", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // Batching, retries, splitting, and concurrency are covered in
  // translation-queue.test.mjs; this checks the page actually uses them.
  assert.match(source, /translateInBatches\(/);
  assert.match(source, /onProgress:/);
  assert.doesNotMatch(source, /for \(let index = 0; index < groups\.length/);
});

test("overlong translations are quality warnings, not failed work", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /translations\[cue\.id\]\?\.trim\(\)/);
  assert.match(source, /pending = tidy\.filter\(\(cue\) => !nextTranslations\[cue\.id\]\?\.trim\(\)\)/);
  assert.doesNotMatch(source, /if \(content !== "source" && overlongCount\) \{[\s\S]{0,200}?return;/);
});

test("every interface language provides every message", async () => {
  // Comments may mention placeholders; only the messages matter.
  const read = async (locale) =>
    (await readFile(new URL(`../lib/i18n/${locale}.ts`, import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const reference = await read("zh-CN");
  const keys = (text) => [...text.matchAll(/^\s+"?([\w-]+)"?: /gm)].map((match) => match[1]);
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const locale of ["zh-TW", "en", "ja", "ko", "es", "fr", "de", "pt", "ru", "ar"]) {
    const text = await read(locale);
    // TypeScript checks the shape; this also catches a dropped {placeholder}.
    assert.deepEqual(keys(text), keys(reference), locale);
    assert.deepEqual(placeholders(text), placeholders(reference), locale);
  }
});

test("translations are kept per language pair and saved once", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // Correcting the source language must not reuse work done under the old one.
  assert.match(source, /pairKey\(sourceLanguage, targetLanguage\)/);
  assert.doesNotMatch(source, /allTranslations\[targetLanguage\]/);
  // The active pair is saved as `translations`, not again inside `byTarget`.
  assert.match(source, /filter\(\(\[key\]\) => key !== currentPair\)/);
});
