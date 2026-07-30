import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSrt,
  serializeSrt,
  splitAtNaturalBreaks,
  tidyCues,
} from "../lib/srt-core.mjs";

const SAMPLE = `\uFEFF1\r
00:00:01,000 --> 00:00:07,000\r
This is a long first thought, and this is the second part of it.\r
\r
2\r
00:00:08,000 --> 00:00:10,000\r
Short line.\r
`;

test("parses CRLF and BOM SRT files", () => {
  const cues = parseSrt(SAMPLE);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[1].endMs, 10000);
});

test("prefers punctuation when splitting long lines", () => {
  const parts = splitAtNaturalBreaks(
    "This is the opening clause, and this is a much longer closing clause.",
    34,
  );
  assert.equal(parts[0], "This is the opening clause,");
  assert.equal(parts.join(" "), "This is the opening clause, and this is a much longer closing clause.");
});

test("new cues preserve the original time range", () => {
  const source = parseSrt(SAMPLE);
  const tidy = tidyCues(source, { maxChars: 32, mode: "new-cue" });
  const firstSourceParts = tidy.filter((cue) => cue.sourceId === "source-1");
  assert.ok(firstSourceParts.length > 1);
  assert.equal(firstSourceParts[0].startMs, source[0].startMs);
  assert.equal(firstSourceParts.at(-1).endMs, source[0].endMs);
  for (let index = 1; index < firstSourceParts.length; index += 1) {
    assert.equal(firstSourceParts[index - 1].endMs, firstSourceParts[index].startMs);
  }
});

test("serializes Chinese first with UTF-8 BOM", () => {
  const cue = tidyCues(parseSrt(SAMPLE), {
    maxChars: 80,
    mode: "new-cue",
  })[0];
  const output = serializeSrt(
    [cue],
    { [cue.id]: "这是中文。" },
    { order: "chinese-first" },
  );
  assert.ok(output.startsWith("\uFEFF1\n"));
  assert.match(output, /这是中文。\nThis is a long first thought/);
});
