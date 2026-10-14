import assert from "node:assert/strict";
import test from "node:test";

let workerPromise;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerPromise ??= import(workerUrl.href);
  return (await workerPromise).default;
}

async function fetchWorker(request) {
  const worker = await loadWorker();
  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server renders the subtitle studio", async () => {
  const response = await fetchWorker(new Request("http://localhost/", {
    headers: { accept: "text/html" },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /双语字幕工坊/);
  assert.match(html, /字幕预览/);
  assert.match(html, /DeepSeek/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

function translationRequest(body) {
  return new Request("http://localhost/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("production translation route rejects invalid input without contacting the provider", async (t) => {
  await loadWorker();
  const upstream = t.mock.method(globalThis, "fetch", () => {
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

test("production translation route preserves valid overlong results and does not expose the key", async (t) => {
  await loadWorker();
  const translation = "这是长度超过建议但仍然有效的中文字幕。".repeat(3);
  const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer fixture-key");
    const body = JSON.parse(options.body);
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

test("production translation route reports rejected credentials without retrying or caching", async (t) => {
  await loadWorker();
  const upstream = t.mock.method(globalThis, "fetch", async () => Response.json({
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
