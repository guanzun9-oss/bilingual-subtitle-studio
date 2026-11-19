import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchWorker, mockUpstream, translationRequest } from "./helpers/worker.mjs";

test("the root address sends readers to their interface language", async () => {
  for (const [acceptLanguage, cookie, expected] of [
    ["zh-CN,zh;q=0.9,en;q=0.8", "", "/zh-CN"],
    ["zh-TW,zh;q=0.9", "", "/zh-TW"],
    ["ja-JP,ja;q=0.9,en;q=0.5", "", "/ja"],
    ["fr-CA;q=0.4,es-MX;q=0.8", "", "/es"],
    ["sw-KE", "", "/en"],
    ["", "", "/en"],
    ["en-US", "cuewise-locale=ko", "/ko"],
    ["en-US", "cuewise-locale=xx", "/en"],
  ]) {
    const headers = { accept: "text/html" };
    if (acceptLanguage) headers["accept-language"] = acceptLanguage;
    if (cookie) headers.cookie = cookie;
    const response = await fetchWorker(new Request("http://localhost/", { headers, redirect: "manual" }));
    assert.equal(response.status, 307, `${acceptLanguage} ${cookie}`);
    assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, expected, `${acceptLanguage} ${cookie}`);
    assert.match(response.headers.get("vary") ?? "", /Accept-Language/i);
  }
});

test("server renders the subtitle studio in each interface language", async () => {
  const render = async (path) => {
    const response = await fetchWorker(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }));
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    return response.text();
  };

  const chinese = await render("/zh-CN");
  assert.match(chinese, /<html lang="zh-CN" dir="ltr">/i);
  assert.match(chinese, /Cuewise/);
  assert.match(chinese, /字幕匠/);
  assert.match(chinese, /字幕预览/);
  assert.match(chinese, /DeepSeek/);
  assert.match(chinese, /hreflang="ja"/i);
  assert.doesNotMatch(chinese, /codex-preview|react-loading-skeleton/i);

  const english = await render("/en");
  assert.match(english, /<html lang="en" dir="ltr">/i);
  assert.match(english, /Make bilingual subtitles/);
  assert.match(english, /Anthropic Claude/);
  assert.doesNotMatch(english, /字幕匠|字幕预览/);

  const arabic = await render("/ar");
  assert.match(arabic, /<html lang="ar" dir="rtl">/i);
  assert.match(arabic, /إنشاء ترجمة ثنائية اللغة/);

  for (const locale of ["zh-TW", "ja", "ko", "es", "fr", "de", "pt", "ru"]) {
    assert.match(await render(`/${locale}`), new RegExp(`<html lang="${locale}"`, "i"));
  }

  const missing = await fetchWorker(new Request("http://localhost/xx", { headers: { accept: "text/html" } }));
  assert.equal(missing.status, 404);
});

test("production translation route rejects invalid input without contacting the provider", async () => {
  const upstream = mockUpstream(() => {
    throw new Error("Invalid input must not trigger an upstream request");
  });
  for (const body of [
    "{broken json",
    { items: [{ id: "cue", text: "Hello." }] },
    { apiKey: "fixture-key", items: [] },
    { apiKey: "fixture-key", items: Array.from({ length: 25 }, () => ({ id: "cue", text: "Hello." })) },
    { apiKey: "fixture-key", items: [{ id: "cue", text: " " }] },
  ]) {
    const response = await fetchWorker(translationRequest(body));
    assert.equal(response.status, 400);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const data = await response.json();
    assert.equal(typeof data.error, "string");
    assert.deepEqual(data.translations, {});
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("production translation route preserves valid overlong results and does not expose the key", async () => {
  const translation = "这是长度超过建议但仍然有效的中文字幕。".repeat(3);
  const upstream = mockUpstream(async (request) => {
    assert.equal(request.url, "https://api.deepseek.com/chat/completions");
    assert.equal(request.headers.get("Authorization"), "Bearer fixture-key");
    const body = await request.json();
    assert.equal(body.model, "deepseek-v4-flash");
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ translations: { s0: translation } }) } }],
    });
  });
  const response = await fetchWorker(translationRequest({
    apiKey: "fixture-key", items: [{ id: "original-cue", text: "Hello.", maxChineseChars: 8 }],
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { translations: { "original-cue": translation } });
  assert.doesNotMatch(body, /fixture-key/);
  assert.equal(upstream.mock.callCount(), 1);
});

test("production translation route reports rejected credentials without retrying or caching", async () => {
  const upstream = mockUpstream(async () => Response.json({
    error: { message: "invalid credentials" },
  }, { status: 401 }));
  const response = await fetchWorker(translationRequest({
    apiKey: "fixture-key", items: [{ id: "cue", text: "Hello." }],
  }));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.text();
  assert.match(JSON.parse(body).error, /API Key 无效/);
  assert.doesNotMatch(body, /fixture-key/);
  assert.equal(upstream.mock.callCount(), 1);
});
