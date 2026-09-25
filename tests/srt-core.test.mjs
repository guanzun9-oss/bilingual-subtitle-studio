import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeFragmentedCues,
  parseSrt,
  isReadableChineseSubtitle,
  serializeSrt,
  splitAtNaturalBreaks,
  tidyCues,
  wrapChineseSubtitle,
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

test("rejoins Buzz fragments before creating readable semantic cues", () => {
  const fragmented = parseSrt(`1
00:00:00,000 --> 00:00:03,687
You cannot control what a great military event

2
00:00:03,687 --> 00:00:07,280
can set loose. More battle casualties than US

3
00:00:07,280 --> 00:00:10,005
forces had suffered in every war combined down

4
00:00:10,005 --> 00:00:12,031
to that point happened in two days.`);

  const merged = mergeFragmentedCues(fragmented);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].startMs, 0);
  assert.equal(merged[0].endMs, 12031);

  const tidy = tidyCues(fragmented, { maxChars: 72, mode: "new-cue" });
  assert.equal(tidy.length, 3);
  assert.equal(
    tidy.map((cue) => cue.text.replace(/\n/g, " ")).join(" "),
    merged[0].text,
  );
  assert.equal(tidy[0].contextText, merged[0].text);
});

test("new cues preserve the original time range without overlapping", () => {
  const source = parseSrt(SAMPLE);
  const tidy = tidyCues(source, { maxChars: 32, mode: "new-cue" });
  const firstSourceParts = tidy.filter((cue) => cue.sourceId === "source-1");
  assert.ok(firstSourceParts.length > 1);
  assert.equal(firstSourceParts[0].startMs, source[0].startMs);
  assert.equal(firstSourceParts.at(-1).endMs, source[0].endMs);
  for (let index = 1; index < firstSourceParts.length; index += 1) {
    assert.ok(firstSourceParts[index - 1].endMs <= firstSourceParts[index].startMs);
  }
});

test("uses original recognition timestamps instead of whole-sentence character ratios", () => {
  const fragmented = parseSrt(`1
00:00:00,000 --> 00:00:02,000
This opening clause has a natural comma,

2
00:00:04,000 --> 00:00:08,000
and the rest of the sentence continues for long enough to require splitting.`);

  const tidy = tidyCues(fragmented, { maxChars: 48 });
  assert.ok(tidy.length >= 2);
  assert.equal(tidy[0].endMs, 2000);
  assert.equal(tidy[1].startMs, 4000);
});

test("keeps prepared English to two 42-character lines", () => {
  const [cue] = tidyCues(parseSrt(`1
00:00:00,000 --> 00:00:06,000
This sentence is deliberately long enough to wrap neatly across two readable subtitle lines.`), {
    maxChars: 72,
  });
  const lines = cue.text.split("\n");
  assert.ok(lines.length <= 2);
  assert.ok(lines.every((line) => line.length <= 42));
});

test("does not create a third line when a short sentence comes first", () => {
  const [cue] = tidyCues(parseSrt(`1
00:00:00,000 --> 00:00:06,000
We agreed. This following sentence is still long enough to need a carefully balanced second line.`), {
    maxChars: 84,
  });
  const lines = cue.text.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.length <= 42));
});

test("wraps readable Chinese into 16-character lines", () => {
  const chinese = "这是一条长度合适而且断句自然的中文字幕";
  const lines = wrapChineseSubtitle(chinese).split("\n");
  assert.ok(lines.length <= 2);
  assert.ok(lines.every((line) => Array.from(line).length <= 16));
  assert.ok(Array.from(lines[0]).length <= Array.from(lines[1]).length);
  assert.equal(isReadableChineseSubtitle(chinese), true);
  assert.equal(isReadableChineseSubtitle(chinese.repeat(2)), false);
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
