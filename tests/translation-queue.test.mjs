import assert from "node:assert/strict";
import test from "node:test";
import { translateInBatches } from "../lib/translation-queue.mjs";

const items = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: `cue-${index + 1}` }));

const translateAll = (batch) => ({
  status: 200,
  data: { translations: Object.fromEntries(batch.map((item) => [item.id, `译 ${item.id}`])) },
});

const fast = { retryDelayMs: 0 };

test("translates every item in batches of the configured size", async () => {
  const sizes = [];
  const result = await translateInBatches(items(30), async (batch) => {
    sizes.push(batch.length);
    return translateAll(batch);
  }, { ...fast, batchSize: 12 });

  assert.equal(Object.keys(result).length, 30);
  assert.equal(result["cue-30"], "译 cue-30");
  assert.deepEqual(sizes.sort((a, b) => b - a), [12, 12, 6]);
});

test("runs at most the configured number of batches at the same time", async () => {
  let inFlight = 0;
  let peak = 0;
  await translateInBatches(items(12 * 8), async (batch) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return translateAll(batch);
  }, { ...fast, concurrency: 3 });

  assert.equal(peak, 3);
});

test("reports each valid translation as soon as it arrives", async () => {
  const reported = {};
  await translateInBatches(items(25), async (batch) => translateAll(batch), {
    ...fast,
    onProgress: (received) => Object.assign(reported, received),
  });
  assert.equal(Object.keys(reported).length, 25);
});

test("retries only the items a response left out", async () => {
  const requested = [];
  const result = await translateInBatches(items(3), async (batch) => {
    requested.push(batch.map((item) => item.id));
    return requested.length === 1
      ? { status: 502, data: { translations: { [batch[0].id]: "第一条" }, error: "还有 2 条未返回" } }
      : translateAll(batch);
  }, fast);

  assert.deepEqual(requested, [["cue-1", "cue-2", "cue-3"], ["cue-2", "cue-3"]]);
  assert.equal(result["cue-1"], "第一条");
  assert.equal(Object.keys(result).length, 3);
});

test("splits a batch that keeps failing with server errors to isolate the bad item", async () => {
  const result = await translateInBatches(items(4), async (batch) => {
    if (batch.some((item) => item.id === "cue-3") && batch.length > 1) {
      return { status: 502, data: { error: "翻译结果格式异常。" } };
    }
    return translateAll(batch);
  }, fast);

  assert.equal(Object.keys(result).length, 4);
});

test("treats an unreadable response as a server error that can be split", async () => {
  let calls = 0;
  const result = await translateInBatches(items(2), async (batch) => {
    calls += 1;
    return batch.length > 1 ? { status: 500, data: null } : translateAll(batch);
  }, fast);

  assert.equal(Object.keys(result).length, 2);
  assert.equal(calls, 4);
});

test("stops every batch on account errors and keeps completed work", async () => {
  let calls = 0;
  await assert.rejects(
    translateInBatches(items(12 * 6), async (batch) => {
      calls += 1;
      if (calls === 1) return translateAll(batch);
      return { status: 401, data: { error: "API Key 无效或没有访问权限，请检查后重试。" } };
    }, { ...fast, concurrency: 1 }),
    (error) => {
      assert.match(error.message, /API Key 无效/);
      assert.equal(error.terminal, true);
      assert.equal(Object.keys(error.partial).length, 12);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("a batch that cannot be translated does not hold back the others", async () => {
  await assert.rejects(
    translateInBatches(items(36), async (batch) => {
      if (batch.some((item) => item.id === "cue-1")) throw new Error("网络连接中断");
      return translateAll(batch);
    }, fast),
    (error) => {
      assert.match(error.message, /网络连接中断/);
      // The first batch of 12 fails; the other two batches still finish.
      assert.equal(Object.keys(error.partial).length, 24);
      assert.equal(error.partial["cue-1"], undefined);
      assert.equal(error.partial["cue-36"], "译 cue-36");
      return true;
    },
  );
});

test("cancellation stops work without waiting for retries", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    translateInBatches(items(12 * 4), async (batch, signal) => {
      calls += 1;
      if (calls === 2) controller.abort();
      if (signal.aborted) throw signal.reason;
      return translateAll(batch);
    }, { retryDelayMs: 60_000, concurrency: 1, signal: controller.signal }),
    (error) => {
      assert.equal(error.name, "AbortError");
      assert.equal(Object.keys(error.partial).length, 12);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("valid text that exceeds a length hint is still accepted", async () => {
  const long = "这是一条明显超过建议长度但仍然有效的中文字幕译文。".repeat(4);
  const result = await translateInBatches(items(1), async () => ({
    status: 200,
    data: { translations: { "cue-1": long } },
  }), fast);
  assert.equal(result["cue-1"], long);
});
