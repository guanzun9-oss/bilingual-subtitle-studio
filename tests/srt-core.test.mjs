import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSrt,
  isReadableChineseSubtitle,
  serializeSrt,
  splitAtNaturalBreaks,
  splitAtSentenceEnds,
  getSubtitleWarnings,
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

test("only splits Buzz cues and never rejoins fragments of the same sentence", () => {
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

  for (const mode of ["new-cue", "line-break"]) {
    const tidy = tidyCues(fragmented, { maxChars: 72, mode });
    assert.equal(tidy.length, 5);
    assert.deepEqual(tidy.map((cue) => cue.sourceId), [
      "source-1", "source-2", "source-2", "source-3", "source-4",
    ]);
    for (const original of fragmented) {
      const parts = tidy.filter((cue) => cue.sourceId === original.sourceId);
      assert.equal(parts[0].startMs, original.startMs);
      assert.equal(parts.at(-1).endMs, original.endMs);
      assert.equal(parts.map((cue) => cue.text.replace(/\n/g, " ")).join(" "), original.text);
      assert.ok(parts.every((cue) => cue.contextText === original.text));
    }
    assert.equal(tidy[1].text, "can set loose.");
    assert.equal(tidy[2].text, "More battle casualties than US");
  }
});

test("sentence ends create new cues even when the whole source cue is short", () => {
  const source = parseSrt(`1
00:00:01,000 --> 00:00:04,000
Yes. Ready? Go! Wait… Done.`);
  for (const mode of ["new-cue", "line-break"]) {
    const tidy = tidyCues(source, { maxChars: 84, mode });
    assert.deepEqual(tidy.map((cue) => cue.text), ["Yes.", "Ready?", "Go!", "Wait…", "Done."]);
    assert.equal(tidy[0].startMs, 1000);
    assert.equal(tidy.at(-1).endMs, 4000);
    for (let index = 1; index < tidy.length; index += 1) {
      assert.equal(tidy[index - 1].endMs, tidy[index].startMs);
    }
  }
});

test("supports Chinese and unspaced English sentence punctuation", () => {
  assert.deepEqual(splitAtSentenceEnds("第一句。第二句？第三句！等一下……继续。"), [
    "第一句。", "第二句？", "第三句！", "等一下……继续。",
  ]);
  assert.deepEqual(splitAtSentenceEnds("Yes.No?Go!One...Two"), [
    "Yes.", "No?", "Go!", "One...", "Two",
  ]);
  assert.deepEqual(splitAtSentenceEnds("好．继续｡结束！"), [
    "好．", "继续｡", "结束！",
  ]);
});

test("ellipsis hesitation does not invent a completed sentence", () => {
  assert.deepEqual(splitAtSentenceEnds("I… don't know. Wait... let me think. Okay… Next."), [
    "I… don't know.", "Wait... let me think.", "Okay…", "Next.",
  ]);
  assert.deepEqual(splitAtSentenceEnds("…and then we left. 我……还没想好。"), [
    "…and then we left.", "我……还没想好。",
  ]);
});

test("short sentences remain on one line in both languages", () => {
  const source = parseSrt(`1
00:00:01,000 --> 00:00:04,000
This is a short sentence.`);
  const [cue] = tidyCues(source);
  assert.equal(cue.text, source[0].text);
  assert.equal(wrapChineseSubtitle("这是短句。"), "这是短句。");
  const srt = serializeSrt([cue], { [cue.id]: "这是短句。" });
  assert.equal(srt.split("\n").slice(2, 4).join("\n"), "这是短句。\nThis is a short sentence.");
});

test("length splitting keeps long words intact rather than altering the transcript", () => {
  const word = "supercalifragilisticexpialidocious";
  assert.deepEqual(splitAtNaturalBreaks(`${word} works.`, 16), [word, "works."]);
  assert.equal(splitAtNaturalBreaks(`${word} works.`, 16).join(" "), `${word} works.`);
});

test("natural line breaks keep common grammatical groups together when they fit", () => {
  const [cue] = tidyCues(parseSrt(`1
00:00:01,000 --> 00:00:07,000
We walked across the park and waited for the train.`));
  assert.ok(cue.text.includes("\n"));
  assert.doesNotMatch(cue.text, /\b(?:the|and|for)\n/);
  assert.equal(cue.text.replace(/\n/g, " "), "We walked across the park and waited for the train.");
});

test("quality warnings report readability without changing or rejecting cues", () => {
  const cue = { text: "Ready?", startMs: 1000, endMs: 1200 };
  assert.deepEqual(getSubtitleWarnings(cue, "准备好了吗？"), [
    "显示不足 0.83 秒", "英文阅读速度超过 20 字符/秒", "中文阅读速度超过 9 字符/秒",
  ]);
  assert.equal(cue.startMs, 1000);
  assert.equal(cue.endMs, 1200);
  assert.deepEqual(getSubtitleWarnings({ ...cue, endMs: 3000 }, "准备好了吗？"), []);
});

test("keeps repeated punctuation and closing quotes with the preceding sentence", () => {
  assert.deepEqual(splitAtSentenceEnds(`He said, "Go!" Are you sure?! (Yes.) Next.`), [
    `He said, "Go!"`, "Are you sure?!", "(Yes.)", "Next.",
  ]);
  assert.deepEqual(splitAtSentenceEnds("他说：“走吧！”你确定吗？！「确定。」继续"), [
    "他说：“走吧！”", "你确定吗？！", "「确定。」", "继续",
  ]);
  assert.deepEqual(splitAtSentenceEnds("  First.\n\nSecond?  "), ["First.", "Second?"]);
  assert.deepEqual(splitAtSentenceEnds(""), []);
});

test("does not mistake decimals, titles, or initials for sentence endings", () => {
  assert.deepEqual(splitAtSentenceEnds("Dr. Smith paid $3.14. He works in the U.S. Army. Try e.g. tea, i.e. a drink. Next."), [
    "Dr. Smith paid $3.14.", "He works in the U.S. Army.",
    "Try e.g. tea, i.e. a drink.", "Next.",
  ]);
  assert.deepEqual(splitAtSentenceEnds("Meet J. R. Smith. He lives in the U.K. We agree."), [
    "Meet J. R. Smith.", "He lives in the U.K.", "We agree.",
  ]);
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

test("keeps original cue boundaries and pauses in both modes", () => {
  const fragmented = parseSrt(`1
00:00:00,000 --> 00:00:02,000
This opening clause has a natural comma,

2
00:00:04,000 --> 00:00:08,000
and the rest of the sentence continues for long enough to require splitting.`);

  for (const mode of ["new-cue", "line-break"]) {
    const tidy = tidyCues(fragmented, { maxChars: 48, mode });
    assert.ok(tidy.length >= fragmented.length);
    assert.equal(tidy[0].endMs, 2000);
    assert.equal(tidy[1].startMs, 4000);
    assert.equal(tidy.at(-1).endMs, 8000);
  }
});

test("keeps prepared English to two 42-character lines", () => {
  const tidy = tidyCues(parseSrt(`1
00:00:00,000 --> 00:00:06,000
This sentence is deliberately long enough to wrap neatly across two readable subtitle lines.`), {
    maxChars: 72,
  });
  for (const cue of tidy) {
    const lines = cue.text.split("\n");
    assert.ok(lines.length <= 2);
    assert.ok(lines.every((line) => line.length <= 42));
  }
});

test("splits a short first sentence before applying long sentence limits", () => {
  const source = parseSrt(`1
00:00:00,000 --> 00:00:06,000
We agreed. This following sentence is still long enough to need a carefully balanced second line.`);
  const tidy = tidyCues(source, { maxChars: 84 });
  assert.equal(tidy[0].text, "We agreed.");
  assert.ok(tidy.length >= 3);
  for (const cue of tidy) {
    const lines = cue.text.split("\n");
    assert.ok(lines.length <= 2);
    assert.ok(lines.every((line) => line.length <= 42));
  }

  const wrapped = tidyCues(source, { mode: "line-break", maxChars: 48 });
  assert.equal(wrapped.length, 2);
  assert.equal(wrapped[0].text, "We agreed.");
  assert.equal(wrapped[1].text.replace(/\n/g, " "), "This following sentence is still long enough to need a carefully balanced second line.");
});

test("never merges touching, paused, or overlapping original cues", () => {
  for (const secondStart of [1900, 2000, 2400, 6000]) {
    const source = [
      { id: "first", sourceId: "source-1", startMs: 1000, endMs: 2000, text: "This unfinished thought" },
      { id: "second", sourceId: "source-2", startMs: secondStart, endMs: 7000, text: "continues here" },
    ];
    for (const mode of ["new-cue", "line-break"]) {
      const tidy = tidyCues(source, { mode, maxChars: 84 });
      assert.equal(tidy.length, 2);
      for (let index = 0; index < source.length; index += 1) {
        assert.equal(tidy[index].text, source[index].text);
        assert.equal(tidy[index].startMs, source[index].startMs);
        assert.equal(tidy[index].endMs, source[index].endMs);
      }
    }
  }
});

test("rounding split times cannot add overlaps or extend the original range", () => {
  const source = [{ id: "tiny", sourceId: "tiny", startMs: 1000, endMs: 1004, text: "A very long first sentence. Yes? Go!" }];
  const tidy = tidyCues(source);
  assert.equal(tidy.length, 3);
  assert.equal(tidy[0].startMs, 1000);
  assert.equal(tidy.at(-1).endMs, 1004);
  for (let index = 0; index < tidy.length; index += 1) {
    assert.ok(tidy[index].endMs > tidy[index].startMs);
    if (index) assert.equal(tidy[index].startMs, tidy[index - 1].endMs);
  }
  assert.throws(() => tidyCues([{ ...source[0], endMs: 1002 }]), /原字幕时长过短/);
});

test("export preserves sentence separation and original cue boundaries", () => {
  const source = parseSrt(`1
00:00:01,000 --> 00:00:04,000
First. Next?

2
00:00:05,000 --> 00:00:07,000
Unfinished

3
00:00:07,000 --> 00:00:09,000
thought ends here.`);
  const tidy = tidyCues(source);
  const exported = parseSrt(serializeSrt(tidy, {}, { bilingual: false }));
  assert.deepEqual(exported.map((cue) => cue.text), ["First.", "Next?", "Unfinished", "thought ends here."]);
  assert.equal(exported[1].endMs, 4000);
  assert.equal(exported[2].startMs, 5000);
  assert.equal(exported[2].endMs, 7000);
  assert.equal(exported[3].startMs, 7000);
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
