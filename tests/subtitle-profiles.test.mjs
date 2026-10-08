import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_PROFILES, getSubtitleProfile } from "../lib/subtitle-profiles.mjs";
import { getSubtitleWarnings, parseSrt, serializeSrt, tidyCues, wrapChineseSubtitle } from "../lib/srt-core.mjs";

const source = parseSrt(`1
00:00:01,000 --> 00:00:05,000
Here is a sentence for a wide screen.

2
00:00:05,000 --> 00:00:09,000
Ready? Go!`);

test("all editor presets export valid SRT with sentence separation and short single lines", () => {
  for (const editor of Object.keys(EDITOR_PROFILES)) {
    const profile = getSubtitleProfile(editor);
    const tidy = tidyCues(source, { lineChars: profile.englishLineChars });
    const srt = serializeSrt(tidy, {}, { ...profile, bilingual: false });
    assert.ok(srt.startsWith("\uFEFF1\r\n"));
    assert.doesNotMatch(srt, /(?<!\r)\n/);
    const roundTrip = parseSrt(srt);
    assert.deepEqual(roundTrip.map((cue) => cue.text), [source[0].text, "Ready?", "Go!"]);
    assert.equal(tidy[0].text.split("\n").length, 1);
    assert.equal(roundTrip[0].startMs, 1000);
    assert.equal(roundTrip.at(-1).endMs, 9000);
  }
});

test("portrait presentation changes actual wrapping and exported Chinese line width", () => {
  const portrait = getSubtitleProfile("resolve", "portrait");
  const tidy = tidyCues(source, { lineChars: portrait.englishLineChars });
  assert.equal(tidy[0].text.split("\n").length, 2);
  assert.ok(tidy[0].text.split("\n").every((line) => line.length <= 32));
  const translation = "这是一句需要在竖屏画面中自然换行的中文";
  const srt = serializeSrt([tidy[0]], { [tidy[0].id]: translation }, portrait);
  const lines = srt.split("\r\n").slice(2, 4);
  assert.ok(lines.every((line) => Array.from(line).length <= 12));
  assert.equal(lines.join(""), translation);
  assert.equal(wrapChineseSubtitle("短句。", portrait.chineseLineChars), "短句。");
});

test("explicit timeline offset shifts all exported times equally and never modifies originals", () => {
  const tidy = tidyCues(source);
  const exported = parseSrt(serializeSrt(tidy, {}, { bilingual: false, timeOffsetMs: 3600000 }));
  for (let index = 0; index < tidy.length; index += 1) {
    assert.equal(exported[index].startMs, tidy[index].startMs + 3600000);
    assert.equal(exported[index].endMs, tidy[index].endMs + 3600000);
  }
  assert.equal(source[0].startMs, 1000);
  assert.throws(() => serializeSrt(tidy, {}, { timeOffsetMs: -1001 }), /负时间/);
});

test("profile quality checks use the selected width and do not block exports", () => {
  const profile = getSubtitleProfile("premiere", "portrait");
  const cue = { id: "long", text: "An exceptionally long line that needs wrapping", startMs: 1000, endMs: 5000 };
  assert.ok(getSubtitleWarnings(cue, "", profile).includes("英文单行超过 32 字符"));
  assert.ok(serializeSrt([cue], {}, { ...profile, bilingual: false }).includes(cue.text));
  assert.equal(getSubtitleProfile("unknown").editor, "generic");
});
