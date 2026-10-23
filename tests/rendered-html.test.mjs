import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Run the production bundle in workerd, the runtime Cloudflare uses, so
// Workers-only imports such as `cloudflare:workers` resolve as they do live.
const serverDir = new URL("../dist/server/", import.meta.url);
let worker;
let workerPromise;
let upstreamHandler = () => {
  throw new Error("Unexpected upstream request");
};

async function loadWorker() {
  workerPromise ??= (async () => {
    const config = JSON.parse(await readFile(new URL("wrangler.json", serverDir), "utf8"));
    const root = fileURLToPath(serverDir);
    const files = await readdir(root, { recursive: true });
    // Miniflare 5 still accepts the documented v4 option shape through this adapter.
    worker = new Miniflare(convertV4MiniflareOptions({
      workers: [{
        name: config.name,
        modulesRoot: root,
        modules: [
          // The entry module must come first.
          { type: "ESModule", path: path.join(root, "index.js") },
          ...files
            .filter((file) => /\.m?js$/.test(file) && file !== "index.js")
            .map((file) => ({ type: "ESModule", path: path.join(root, file) })),
        ],
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        serviceBindings: {
          ASSETS: () => new Response("Not found", { status: 404 }),
        },
        outboundService: (request) => upstreamHandler(request),
      }],
    }));
    await worker.ready;
    return worker;
  })();
  return workerPromise;
}

// Dispose even when startup failed, or the workerd process keeps the run alive.
after(async () => {
  await worker?.dispose();
});

async function fetchWorker(request) {
  const worker = await loadWorker();
  return worker.dispatchFetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body ? await request.text() : undefined,
  });
}

function mockUpstream(implementation) {
  const handler = mock.fn(implementation);
  upstreamHandler = handler;
  return handler;
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

test("production translation route rejects invalid input without contacting the provider", async () => {
  await loadWorker();
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
  await loadWorker();
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
  await loadWorker();
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
