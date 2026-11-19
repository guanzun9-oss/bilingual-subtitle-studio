import assert from "node:assert/strict";
import { test } from "node:test";
import { completion, fetchWorker, mockUpstream, translationRequest } from "./helpers/worker.mjs";

// Providers, languages and interface wording of /api/translate, with every provider mocked.

async function translate(body) {
  const response = await fetchWorker(translationRequest({ apiKey: "fixture-key", items: [{ id: "cue", text: "Hello." }], ...body }));
  return { status: response.status, body: await response.json() };
}

test("OpenAI-compatible providers get their own endpoint, key header and token field", async () => {
  const cases = [
    ["openai", "https://api.openai.com/v1/chat/completions", "max_completion_tokens"],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "max_tokens"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions", "max_tokens"],
    ["qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "max_tokens"],
    ["qwen-intl", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", "max_tokens"],
    ["moonshot", "https://api.moonshot.cn/v1/chat/completions", "max_tokens"],
    ["zhipu", "https://open.bigmodel.cn/api/paas/v4/chat/completions", "max_tokens"],
    ["mistral", "https://api.mistral.ai/v1/chat/completions", "max_tokens"],
  ];
  for (const [provider, url, tokenField] of cases) {
    let seen;
    mockUpstream(async (request) => {
      seen = { url: request.url, auth: request.headers.get("Authorization"), body: await request.json() };
      return completion({ translations: { s0: "Hola." } });
    });
    const { status, body } = await translate({ provider, targetLanguage: "es" });
    assert.equal(status, 200, provider);
    assert.deepEqual(body.translations, { cue: "Hola." });
    assert.equal(seen.url, url, provider);
    assert.equal(seen.auth, "Bearer fixture-key", provider);
    assert.ok(Number.isInteger(seen.body[tokenField]), provider);
    assert.match(seen.body.messages[0].content, /from English into Spanish/, provider);
  }
});

test("typed model names reach the provider; malformed ones fall back to its first model", async () => {
  const models = [];
  mockUpstream(async (request) => {
    models.push((await request.json()).model);
    return completion({ translations: { s0: "Hola." } });
  });
  await translate({ provider: "openrouter", model: "meta-llama/llama-5:free", targetLanguage: "es" });
  await translate({ provider: "openai", model: "bad model; drop", targetLanguage: "es" });
  await translate({ provider: "openai", targetLanguage: "es" });
  assert.deepEqual(models, ["meta-llama/llama-5:free", "gpt-5.6-luna", "gpt-5.6-luna"]);
});

test("Claude is called through the Anthropic SDK with structured output and refusal fallbacks", async () => {
  const requests = [];
  mockUpstream(async (request) => {
    requests.push({ url: request.url, headers: Object.fromEntries(request.headers), body: await request.json() });
    return Response.json({
      id: "msg_fixture",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify({ translations: [{ id: "s0", text: "こんにちは。" }] }) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });
  const opus = await translate({ provider: "anthropic", targetLanguage: "ja" });
  assert.equal(opus.status, 200);
  assert.deepEqual(opus.body.translations, { cue: "こんにちは。" });
  const [first] = requests;
  assert.match(first.url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.equal(first.headers.authorization, "Bearer fixture-key");
  assert.match(first.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.equal(first.body.model, "claude-opus-5-5");
  assert.equal(first.body.fallbacks, "default");
  assert.equal(first.body.output_config.effort, "low");
  assert.equal(first.body.output_config.format.type, "json_schema");
  assert.match(first.body.system, /from English into Japanese/);
  assert.equal("temperature" in first.body, false);

  // Haiku has no server-side fallback, so none is requested.
  await translate({ provider: "anthropic", model: "claude-haiku-5-5", targetLanguage: "ja" });
  assert.equal(requests[1].body.model, "claude-haiku-5-5");
  assert.equal("fallbacks" in requests[1].body, false);
});

test("a Claude refusal or rejected key is reported, not retried forever", async () => {
  let calls = 0;
  mockUpstream(async () => {
    calls += 1;
    return Response.json({
      id: "msg_fixture", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [], stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 },
    });
  });
  const refused = await translate({ provider: "anthropic", targetLanguage: "fr", locale: "en" });
  assert.equal(refused.status, 502);
  assert.equal(refused.body.error, "The model declined to translate this batch.");
  assert.equal(calls, 3);

  mockUpstream(async () => Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 }));
  const rejected = await translate({ provider: "anthropic", targetLanguage: "fr", locale: "en" });
  assert.equal(rejected.status, 401);
  assert.match(rejected.body.error, /API key is invalid/);
  assert.doesNotMatch(JSON.stringify(rejected.body), /fixture-key/);
});

test("errors come back in the reader's interface language", async () => {
  mockUpstream(async () => Response.json({ error: { message: "slow down" } }, { status: 429 }));
  const japanese = await translate({ provider: "openai", targetLanguage: "es", locale: "ja" });
  assert.equal(japanese.status, 429);
  assert.match(japanese.body.error, /OpenAI へのリクエストが多すぎる/);

  mockUpstream(() => {
    throw new Error("Invalid input must not trigger an upstream request");
  });
  const missingKey = await fetchWorker(translationRequest({ provider: "gemini", locale: "de", items: [{ id: "a", text: "Hi." }] }));
  assert.equal(missingKey.status, 400);
  assert.match((await missingKey.json()).error, /Google Gemini-API-Schlüssel/);
});

test("rejects unknown providers and unsupported or identical languages before calling anyone", async () => {
  mockUpstream(() => {
    throw new Error("Invalid input must not trigger an upstream request");
  });
  for (const body of [
    { provider: "example" },
    { provider: "openai", sourceLanguage: "xx" },
    { provider: "openai", targetLanguage: "klingon" },
    { provider: "openai", sourceLanguage: "es", targetLanguage: "es" },
  ]) {
    const { status } = await translate(body);
    assert.equal(status, 400, JSON.stringify(body));
  }
});

test("other source languages and Gemini's error shape are handled", async () => {
  let system;
  mockUpstream(async (request) => {
    system = (await request.json()).messages[0].content;
    return completion({ translations: { s0: "Hello." } });
  });
  await translate({ provider: "deepseek", sourceLanguage: "ja", targetLanguage: "en", items: [{ id: "a", text: "こんにちは。" }] });
  assert.match(system, /from Japanese into English/);

  mockUpstream(async () => Response.json([{ error: { code: 400, message: "model not found" } }], { status: 400 }));
  const { status, body } = await translate({ provider: "gemini", model: "gemini-nope", targetLanguage: "es" });
  assert.equal(status, 502);
  assert.equal(body.error, "model not found");
});
