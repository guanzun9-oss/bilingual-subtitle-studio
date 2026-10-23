import assert from "node:assert/strict";
import test from "node:test";
import { MAX_GLOSSARY_ENTRIES, glossaryFor, parseGlossary } from "../lib/glossary.mjs";

test("parses common separators and trims both sides", () => {
  assert.deepEqual(
    parseGlossary("Zane = 赞恩\n  Kubernetes→Kubernetes \nOpenAI -> OpenAI\r\nNew York ＝ 纽约"),
    [["Zane", "赞恩"], ["Kubernetes", "Kubernetes"], ["OpenAI", "OpenAI"], ["New York", "纽约"]],
  );
});

test("skips blank, malformed, repeated, and overlong lines", () => {
  const long = "x".repeat(101);
  assert.deepEqual(
    parseGlossary(`\njust a note\n= 无原文\nZane =\nZane = 赞恩\nzane = 扎内\n${long} = 太长`),
    [["Zane", "赞恩"]],
  );
  assert.deepEqual(parseGlossary(undefined), []);
});

test("a side that is only whitespace skips the line instead of producing an empty term", () => {
  assert.deepEqual(parseGlossary(" = 译名\nName =  \n\t→ 词\nOk = 好"), [["Ok", "好"]]);
});

test(`keeps at most ${MAX_GLOSSARY_ENTRIES} entries`, () => {
  const text = Array.from({ length: MAX_GLOSSARY_ENTRIES + 5 }, (_, index) => `Term${index} = 词${index}`).join("\n");
  assert.equal(parseGlossary(text).length, MAX_GLOSSARY_ENTRIES);
});

test("sends only the terms that occur in the batch, ignoring case", () => {
  const entries = [["Zane", "赞恩"], ["Kubernetes", "Kubernetes"], ["Mars", "火星"]];
  assert.deepEqual(glossaryFor(entries, ["zane said hi.", "We use KUBERNETES."]), [["Zane", "赞恩"], ["Kubernetes", "Kubernetes"]]);
  assert.deepEqual(glossaryFor(entries, ["Nothing here."]), []);
});

test("matches whole terms, with plural and possessive endings", () => {
  const entries = [["Ann", "安"], ["Mars", "火星"], ["robot", "机器人"], ["C++", "C++"], ["New York", "纽约"]];
  assert.deepEqual(glossaryFor(entries, ["We cannot go to Marshall."]), []);
  assert.deepEqual(
    glossaryFor(entries, ["Ann's robots love C++ in new york."]).map(([source]) => source),
    ["Ann", "robot", "C++", "New York"],
  );
  assert.deepEqual(glossaryFor(entries, ["Mars."]), [["Mars", "火星"]]);
});
