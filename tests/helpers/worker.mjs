import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { after, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Run the production bundle in workerd, the runtime Cloudflare uses, so
// Workers-only imports such as `cloudflare:workers` resolve as they do live.
// Miniflare comes with the Cloudflare tooling rather than as its own pinned
// dependency, so the test runtime moves with wrangler and the Vite plugin.
const serverDir = new URL("../../dist/server/", import.meta.url);
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

export async function fetchWorker(request) {
  const worker = await loadWorker();
  return worker.dispatchFetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body ? await request.text() : undefined,
  });
}

/** Replace the DeepSeek endpoint for the following requests; returns the mock for call counts. */
export function mockUpstream(implementation) {
  const handler = mock.fn(implementation);
  upstreamHandler = handler;
  return handler;
}

export function translationRequest(body) {
  return new Request("http://localhost/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A DeepSeek chat completion whose message content is `content` (an object is JSON-encoded). */
export function completion(content) {
  return Response.json({
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
  });
}
