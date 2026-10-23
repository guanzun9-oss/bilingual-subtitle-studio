import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SESSIONS,
  fingerprint,
  listSessions,
  loadApiKey,
  loadPrefs,
  loadSession,
  removeSession,
  saveApiKey,
  savePrefs,
  saveSession,
} from "../lib/session-store.mjs";

/** A localStorage stand-in with an optional character quota. */
function memoryStorage(quota = Infinity) {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      const used = [...data].reduce((sum, [k, v]) => sum + (k === key ? 0 : k.length + v.length), 0);
      if (used + key.length + value.length > quota) throw new Error("QuotaExceededError");
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key),
  };
}

test("the same text always maps to the same session and different text does not", () => {
  assert.equal(fingerprint("1\n00:00:01,000 --> 00:00:02,000\nHi."), fingerprint("1\n00:00:01,000 --> 00:00:02,000\nHi."));
  assert.notEqual(fingerprint("Hi."), fingerprint("Ho."));
  assert.notEqual(fingerprint("ab"), fingerprint("abc"));
});

test("a saved session restores its source and translations", () => {
  const storage = memoryStorage();
  const translations = { "source-1|0|Hi.": "你好。", "source-2|0|Bye.": "" };
  assert.equal(saveSession(storage, { id: "a", name: "film.srt", sourceText: "SRT", translations }, 1000), "saved");

  assert.deepEqual(loadSession(storage, "a"), { id: "a", name: "film.srt", savedAt: 1000, translations, sourceText: "SRT" });
  assert.deepEqual(listSessions(storage), [{ id: "a", name: "film.srt", savedAt: 1000, translated: 1, hasSource: true }]);
});

test("saving again updates one entry and moves it to the front", () => {
  const storage = memoryStorage();
  saveSession(storage, { id: "a", name: "a.srt", sourceText: "A", translations: {} }, 1);
  saveSession(storage, { id: "b", name: "b.srt", sourceText: "B", translations: {} }, 2);
  saveSession(storage, { id: "a", name: "a.srt", sourceText: "A", translations: { x: "译" } }, 3);
  assert.deepEqual(listSessions(storage).map((entry) => [entry.id, entry.translated]), [["a", 1], ["b", 0]]);
});

test(`keeps only the ${MAX_SESSIONS} most recent sessions`, () => {
  const storage = memoryStorage();
  for (let index = 0; index < MAX_SESSIONS + 2; index += 1) {
    saveSession(storage, { id: `s${index}`, name: `${index}.srt`, sourceText: "SRT", translations: {} }, index);
  }
  assert.deepEqual(listSessions(storage).map((entry) => entry.id), ["s4", "s3", "s2"]);
  assert.equal(loadSession(storage, "s0"), null);
  assert.equal([...storage.data.keys()].filter((key) => key.includes("session:")).length, MAX_SESSIONS);
});

test("when storage is full, older sessions make room for the current one", () => {
  const storage = memoryStorage(900);
  saveSession(storage, { id: "old", name: "old.srt", sourceText: "x".repeat(400), translations: {} }, 1);
  const result = saveSession(storage, { id: "new", name: "new.srt", sourceText: "y".repeat(400), translations: { a: "译" } }, 2);
  assert.equal(result, "saved");
  assert.deepEqual(listSessions(storage).map((entry) => entry.id), ["new"]);
});

test("a source too large to store still keeps the paid translations", () => {
  const storage = memoryStorage(600);
  const result = saveSession(storage, { id: "big", name: "big.srt", sourceText: "z".repeat(1000), translations: { a: "译文" } }, 1);
  assert.equal(result, "saved-without-source");
  assert.equal(loadSession(storage, "big").sourceText, undefined);
  assert.deepEqual(loadSession(storage, "big").translations, { a: "译文" });
  assert.equal(listSessions(storage)[0].hasSource, false);
});

test("unavailable or corrupted storage never throws", () => {
  const broken = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  assert.equal(saveSession(broken, { id: "a", name: "a", sourceText: "", translations: {} }), "failed");
  assert.deepEqual(listSessions(broken), []);
  assert.equal(loadSession(broken, "a"), null);
  assert.equal(saveSession(undefined, { id: "a", name: "a", sourceText: "", translations: {} }), "failed");

  const corrupted = memoryStorage();
  corrupted.setItem("subtitle-studio:sessions", "{not json");
  corrupted.setItem("subtitle-studio:session:a", "[]");
  assert.deepEqual(listSessions(corrupted), []);
  assert.equal(loadSession(corrupted, "a"), null);
});

test("removing a session deletes its data and index entry", () => {
  const storage = memoryStorage();
  saveSession(storage, { id: "a", name: "a.srt", sourceText: "A", translations: {} });
  removeSession(storage, "a");
  assert.deepEqual(listSessions(storage), []);
  assert.equal(storage.data.has("subtitle-studio:session:a"), false);
});

test("preferences and an opted-in API key round-trip; an empty key is forgotten", () => {
  const storage = memoryStorage();
  savePrefs(storage, { frame: "portrait", order: "english-first" });
  assert.deepEqual(loadPrefs(storage), { frame: "portrait", order: "english-first" });

  assert.equal(loadApiKey(storage), "");
  saveApiKey(storage, "sk-local");
  assert.equal(loadApiKey(storage), "sk-local");
  saveApiKey(storage, "");
  assert.equal(loadApiKey(storage), "");
  assert.equal(storage.data.size, 1);
});
