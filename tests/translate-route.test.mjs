import assert from "node:assert/strict";
import { test } from "node:test";
import { completion, fetchWorker, mockUpstream, translationRequest } from "./helpers/worker.mjs";

// Behaviour of /api/translate in the production Worker, with DeepSeek mocked.

async function translate(body) {
  const response = await fetchWorker(translationRequest({ apiKey: "fixture-key", ...body }));
  return { status: response.status, body: await response.json() };
}

test("sends compact items and shares one context between pieces of the same cue", async () => {
  let sent;
  mockUpstream(async (request) => {
    sent = JSON.parse((await request.json()).messages[1].content);
    return completion({ translations: { s0: "当我们开始时，", s1: "我们以为很难。", s2: "好的。" } });
  });
  const context = "When we started, we thought it was hard.";
  const { status, body } = await translate({
    items: [
      { id: "cue-1-1", text: "When we started,", context, maxChineseChars: 16 },
      { id: "cue-1-2", text: "we thought it was hard.", context, maxChineseChars: 16 },
      { id: "cue-2-1", text: "OK." },
    ],
  });

  assert.equal(status, 200);
  assert.deepEqual(body.translations, { "cue-1-1": "当我们开始时，", "cue-1-2": "我们以为很难。", "cue-2-1": "好的。" });
  assert.deepEqual(sent.c, [context]);
  assert.deepEqual(sent.s.map((item) => [item.id, item.c, item.m]), [["s0", 0, 16], ["s1", 0, 16], ["s2", undefined, 32]]);
});

test("accepts JSON wrapped in a Markdown fence or surrounded by text", async () => {
  for (const content of [
    "```json\n{\"translations\":{\"s0\":\"你好。\"}}\n```",
    "好的，结果如下：{\"translations\":{\"s0\":\"你好。\"}} 以上。",
    "{\"translations\":[{\"id\":\"s0\",\"text\":\"你好。\"}]}",
  ]) {
    mockUpstream(async () => completion(content));
    const { status, body } = await translate({ items: [{ id: "cue", text: "Hello." }] });
    assert.equal(status, 200, content);
    assert.deepEqual(body.translations, { cue: "你好。" });
  }
});

test("asks again only for items the model left out", async () => {
  const requested = [];
  mockUpstream(async (request) => {
    const items = JSON.parse((await request.json()).messages[1].content).s;
    requested.push(items.map((item) => item.t));
    return completion({ translations: { s0: `译：${items[0].t}` } });
  });
  const { status, body } = await translate({
    items: [{ id: "a", text: "One." }, { id: "b", text: "Two." }, { id: "c", text: "Three." }],
  });

  assert.equal(status, 200);
  assert.deepEqual(requested, [["One.", "Two.", "Three."], ["Two.", "Three."], ["Three."]]);
  assert.deepEqual(body.translations, { a: "译：One.", b: "译：Two.", c: "译：Three." });
});

test("ignores IDs and empty text the model invented", async () => {
  mockUpstream(async () => completion({ translations: { s0: "  ", s9: "多余", s1: "第二条" } }));
  const { status, body } = await translate({ items: [{ id: "a", text: "One." }, { id: "b", text: "Two." }] });
  // "a" never comes back, so the batch fails with what it has and the
  // browser queue retries or splits it.
  assert.equal(status, 502);
  assert.deepEqual(body.translations, { b: "第二条" });
  assert.equal(body.error, "翻译结果格式异常。");
});

test("retries malformed output before giving up", async () => {
  let calls = 0;
  mockUpstream(async () => {
    calls += 1;
    return calls === 1 ? completion("not json at all") : completion({ translations: { s0: "你好。" } });
  });
  const { status, body } = await translate({ items: [{ id: "cue", text: "Hello." }] });
  assert.equal(status, 200);
  assert.deepEqual(body.translations, { cue: "你好。" });
  assert.equal(calls, 2);
});

test("reports rate limits as 429 after retrying", async () => {
  const upstream = mockUpstream(async () => Response.json({ error: { message: "rate limited" } }, { status: 429 }));
  const { status, body } = await translate({ items: [{ id: "cue", text: "Hello." }] });
  assert.equal(status, 429);
  assert.match(body.error, /请求过于频繁或余额不足/);
  assert.equal(upstream.mock.callCount(), 3);
});

test("passes on the provider's message when it keeps failing", async () => {
  const upstream = mockUpstream(async () => Response.json({ error: { message: "upstream overloaded" } }, { status: 503 }));
  const { status, body } = await translate({ items: [{ id: "cue", text: "Hello." }] });
  assert.equal(status, 502);
  assert.equal(body.error, "upstream overloaded");
  assert.deepEqual(body.translations, {});
  assert.equal(upstream.mock.callCount(), 3);
});

test("only allows the supported models", async () => {
  const models = [];
  mockUpstream(async (request) => {
    models.push((await request.json()).model);
    return completion({ translations: { s0: "你好。" } });
  });
  await translate({ model: "deepseek-v4-pro", items: [{ id: "cue", text: "Hello." }] });
  await translate({ model: "gpt-5", items: [{ id: "cue", text: "Hello." }] });
  assert.deepEqual(models, ["deepseek-v4-pro", "deepseek-v4-flash"]);
});

test("rejects length targets outside the supported range", async () => {
  mockUpstream(() => {
    throw new Error("Invalid input must not trigger an upstream request");
  });
  for (const maxChineseChars of [7, 33, 12.5]) {
    const { status } = await translate({ items: [{ id: "cue", text: "Hello.", maxChineseChars }] });
    assert.equal(status, 400, String(maxChineseChars));
  }
});
