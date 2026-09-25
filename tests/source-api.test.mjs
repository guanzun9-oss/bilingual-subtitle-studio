import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/api/translate/route.ts", import.meta.url);

test("translation length target never invalidates a valid API result", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const expectedIds = new Set/);
  assert.match(source, /normalizeTranslations\(\s*extractJson\(content\),\s*expectedIds/);
  assert.doesNotMatch(
    source,
    /item\.text\.replace\(\/\\s\/g, ""\)\)\.length\s*<=/,
  );
  assert.doesNotMatch(
    source,
    /text\.replace\(\/\\s\/g, ""\)\)\.length\s*<=/,
  );
});
