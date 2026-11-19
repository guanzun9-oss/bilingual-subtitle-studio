import assert from "node:assert/strict";
import test from "node:test";
import {
  LANGUAGES,
  getLanguage,
  guessLanguage,
  isSpacedText,
  lineCharsFor,
  maxTranslationChars,
} from "../lib/languages.mjs";
import {
  getSubtitleWarnings,
  parseSrt,
  serializeSrt,
  splitAtNaturalBreaks,
  splitAtSentenceEnds,
  textLength,
  tidyCues,
  wrapSubtitle,
} from "../lib/srt-core.mjs";
import { getSubtitleProfile } from "../lib/subtitle-profiles.mjs";

test("every language has a unique code, a native name and sane layout values", () => {
  assert.equal(new Set(LANGUAGES.map((language) => language.code)).size, LANGUAGES.length);
  for (const language of LANGUAGES) {
    assert.ok(language.name && language.english, language.code);
    assert.ok(language.lineChars >= 8 && language.lineChars <= 42, language.code);
    assert.ok(language.cps >= 3 && language.cps <= 20, language.code);
  }
  assert.equal(getLanguage("unknown").code, "en");
  assert.equal(lineCharsFor("en", "portrait"), 32);
  assert.equal(lineCharsFor("zh-Hans", "portrait"), 12);
  assert.equal(lineCharsFor("ja"), 13);
});

test("translation budgets follow each language's width and reading speed", () => {
  // 4 seconds of Chinese at 9 chars/s, capped at two 16-character lines.
  assert.equal(maxTranslationChars(4000, "zh-Hans"), 32);
  assert.equal(maxTranslationChars(2000, "zh-Hans"), 18);
  assert.equal(maxTranslationChars(2000, "es"), 34);
  assert.equal(maxTranslationChars(10_000, "es"), 84);
  assert.equal(maxTranslationChars(500, "ja"), 8);
});

test("sentence ends split cues in many scripts", () => {
  assert.deepEqual(splitAtSentenceEnds("こんにちは。元気ですか？はい！", "ja"), ["こんにちは。", "元気ですか？", "はい！"]);
  assert.deepEqual(splitAtSentenceEnds("¿Estás listo? ¡Vamos! Ya.", "es"), ["¿Estás listo?", "¡Vamos!", "Ya."]);
  assert.deepEqual(splitAtSentenceEnds("هل أنت مستعد؟ نعم.", "ar"), ["هل أنت مستعد؟", "نعم."]);
  assert.deepEqual(splitAtSentenceEnds("मैं तैयार हूँ। चलो।", "hi"), ["मैं तैयार हूँ।", "चलो।"]);
  assert.deepEqual(splitAtSentenceEnds("Ты готов? Да. Пошли!", "ru"), ["Ты готов?", "Да.", "Пошли!"]);
});

test("language titles and abbreviations are not sentence ends", () => {
  assert.deepEqual(splitAtSentenceEnds("El Sr. García llegó tarde. Luego se fue.", "es"), ["El Sr. García llegó tarde.", "Luego se fue."]);
  assert.deepEqual(splitAtSentenceEnds("M. Dupont est là. Il attend.", "fr"), ["M. Dupont est là.", "Il attend."]);
  assert.deepEqual(splitAtSentenceEnds("Nimm z.B. Tee. Danke.", "de"), ["Nimm z.B. Tee.", "Danke."]);
  // An initial before a name continues the sentence.
  assert.deepEqual(splitAtSentenceEnds("Lo dijo J. Pérez ayer. Bien.", "es"), ["Lo dijo J. Pérez ayer.", "Bien."]);
});

test("unspaced source text is split and wrapped by characters, never left as one long line", () => {
  const sentence = "私たちがこのプロジェクトを始めたとき、一番難しいのは技術だと思っていましたが、実際には人々が本当に必要としているものを理解することでした。";
  const parts = splitAtNaturalBreaks(sentence, 26, "ja");
  assert.equal(parts.join(""), sentence);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 26));
  assert.ok(parts[0].endsWith("、"), parts[0]);
  // No line starts with closing punctuation.
  assert.ok(parts.every((part) => !/^[、。，！？」』）]/.test(part)));

  const [cue, ...rest] = tidyCues(parseSrt(`1
00:00:01,000 --> 00:00:09,000
${sentence}`), { language: "ja", lineChars: lineCharsFor("ja"), maxChars: 36 });
  assert.ok(rest.length >= 1);
  assert.ok([cue, ...rest].every((piece) => piece.text.split("\n").every((line) => Array.from(line).length <= 13)));
  assert.equal([cue, ...rest].map((piece) => piece.text.replace(/\n/g, "")).join(""), sentence);
});

test("Chinese source cues keep the split-only rule and original timing", () => {
  const cues = parseSrt(`1
00:00:01,000 --> 00:00:05,000
我们刚开始做这个项目时，以为最难的会是技术。结果不是。

2
00:00:05,000 --> 00:00:07,000
好的`);
  const tidy = tidyCues(cues, { language: "zh-Hans", lineChars: 16, maxChars: 32 });
  assert.deepEqual(tidy.map((cue) => cue.sourceId), ["source-1", "source-1", "source-2"]);
  assert.equal(tidy[1].text, "结果不是。");
  assert.equal(tidy[0].startMs, 1000);
  assert.equal(tidy[1].endMs, 5000);
  assert.equal(tidy[2].startMs, 5000);
});

test("spaced languages wrap into balanced lines without stranding articles", () => {
  const spanish = "Cuando empezamos este proyecto pensábamos que lo más difícil sería la tecnología";
  const wrapped = wrapSubtitle(spanish, 42, "es");
  const lines = wrapped.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.length <= 42));
  assert.doesNotMatch(wrapped, /\b(?:la|el|de|que)\n/);
  assert.equal(lines.join(" "), spanish);
  assert.equal(wrapSubtitle("Hola.", 42, "es"), "Hola.");
});

test("translations wrap by their own language when exported", () => {
  const [cue] = tidyCues(parseSrt(`1
00:00:01,000 --> 00:00:05,000
When we started this project, we thought it would be easy.`));
  const translations = {
    [cue.id]: "Cuando empezamos este proyecto pensamos que sería muy sencillo de verdad",
  };
  const spanish = serializeSrt([cue], translations, { targetLanguage: "es", targetLineChars: 42 });
  const lines = spanish.replace(/^﻿/, "").split("\n");
  assert.equal(lines[2] + " " + lines[3], translations[cue.id]);
  assert.match(lines[4], /^When we started/);

  const translationOnly = parseSrt(serializeSrt([cue], translations, { content: "translation", targetLanguage: "es" }));
  assert.equal(translationOnly[0].text, translations[cue.id]);
  const sourceFirst = serializeSrt([{ ...cue, text: "This is it." }], { [cue.id]: "これは翻訳です。" }, { order: "source-first", targetLanguage: "ja" });
  assert.match(sourceFirst, /This is it\.\nこれは翻訳です。/);
});

test("quality warnings use the source and target languages' limits", () => {
  const cue = { text: "Ready?", startMs: 1000, endMs: 3000 };
  const profile = getSubtitleProfile("generic", "landscape", "en", "ja");
  // Ten Japanese characters in two seconds exceed 4 characters per second.
  assert.deepEqual(getSubtitleWarnings(cue, "準備はできていますか", profile), [{ code: "target-speed", limit: 4 }]);
  assert.deepEqual(getSubtitleWarnings(cue, "¿Estás listo?", getSubtitleProfile("generic", "landscape", "en", "es")), []);
  assert.equal(textLength("a  b", "es"), 3);
  assert.equal(textLength("你 好", "zh-Hans"), 2);
});

test("profiles report widths for the chosen languages and frame", () => {
  const profile = getSubtitleProfile("resolve", "portrait", "ja", "de");
  assert.equal(profile.sourceLineChars, 10);
  assert.equal(profile.targetLineChars, 32);
  assert.equal(profile.maxSourceCps, 4);
  assert.equal(profile.maxTargetCps, 17);
  assert.equal(getSubtitleProfile("generic", "landscape", "xx", "yy").sourceLanguage, "en");
});

test("guesses the source language from its script or common words", () => {
  assert.equal(guessLanguage("こんにちは。今日はいい天気ですね。"), "ja");
  assert.equal(guessLanguage("我们这个项目来说时间不够。"), "zh-Hans");
  assert.equal(guessLanguage("我們這個項目來說時間不夠。"), "zh-Hant");
  assert.equal(guessLanguage("안녕하세요. 만나서 반갑습니다."), "ko");
  assert.equal(guessLanguage("Привет. Как дела? Это хорошо."), "ru");
  assert.equal(guessLanguage("Привіт. Як справи? Їжак і ґанок."), "uk");
  assert.equal(guessLanguage("Hola, ¿qué tal? Yo no sé lo que está pasando con el proyecto, pero es muy importante para los dos."), "es");
  assert.equal(guessLanguage("When we started this project, we thought the hardest part would be the technology and that it was not easy."), "en");
  assert.equal(guessLanguage("Je ne sais pas ce que vous voulez, mais c'est le moment pour nous et pour les autres."), "fr");
  assert.equal(guessLanguage("12345"), "");
});

test("glossary matching knows which scripts separate words", () => {
  assert.equal(isSpacedText("Zane"), true);
  assert.equal(isSpacedText("Иван"), true);
  assert.equal(isSpacedText("赞恩"), false);
  assert.equal(isSpacedText("ザイン"), false);
});
