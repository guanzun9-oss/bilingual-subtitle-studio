/**
 * Browser-side translation scheduling. It is free of React and fetch so the
 * batching, retry, split, and concurrency rules can be tested directly.
 */

export const BATCH_SIZE = 12;
export const CONCURRENCY = 3;

// Bad credentials, missing balance, or rate limits will not improve by
// retrying or splitting, and every other batch would hit the same wall.
const TERMINAL_STATUSES = new Set([401, 403, 429]);

export function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * Translate `items` (each with an `id`) through `send(items, signal)`, which
 * resolves to `{ status, data }` where `data` is the parsed JSON body or null.
 *
 * Batches run `concurrency` at a time. A batch that keeps failing with a
 * server error is halved until the failing items are isolated. Valid
 * translations are reported through `onProgress` as soon as they arrive, and
 * a failure carries everything completed so far in `error.partial`.
 */
export async function translateInBatches(items, send, options = {}) {
  const {
    batchSize = BATCH_SIZE,
    concurrency = CONCURRENCY,
    retryDelayMs = 900,
    signal,
    onProgress,
  } = options;
  const completed = {};
  const groups = chunk(items, batchSize);
  let nextGroup = 0;
  let failure = null;
  let stopped = false;

  async function translateGroup(group) {
    let remaining = group.filter((item) => !completed[item.id]);
    let lastMessage = "翻译失败，请稍后重试。";
    let canSplit = false;

    for (let attempt = 0; attempt < 2 && remaining.length; attempt += 1) {
      try {
        const { status, data } = await send(remaining, signal);
        if (!data) lastMessage = "服务器返回异常，正在自动缩小批次。";

        const received = {};
        for (const item of remaining) {
          const text = data?.translations?.[item.id];
          if (typeof text === "string" && text.trim()) received[item.id] = text;
        }
        if (Object.keys(received).length) {
          Object.assign(completed, received);
          onProgress?.(received);
        }
        remaining = remaining.filter((item) => !completed[item.id]);
        if (!remaining.length) return;

        lastMessage = data?.error || lastMessage;
        if (TERMINAL_STATUSES.has(status)) {
          const error = new Error(lastMessage);
          error.terminal = true;
          throw error;
        }
        canSplit = status >= 500;
      } catch (error) {
        if (signal?.aborted || error?.terminal) throw error;
        lastMessage = error instanceof Error && error.message
          ? error.message
          : "网络连接中断，正在自动重试。";
      }

      if (attempt < 1) await wait(retryDelayMs, signal);
    }

    if (canSplit && remaining.length > 1) {
      const middle = Math.ceil(remaining.length / 2);
      await translateGroup(remaining.slice(0, middle));
      await translateGroup(remaining.slice(middle));
      return;
    }
    throw new Error(lastMessage);
  }

  async function worker() {
    while (!stopped && nextGroup < groups.length) {
      const group = groups[nextGroup];
      nextGroup += 1;
      try {
        await translateGroup(group);
      } catch (error) {
        failure ??= error;
        // One stubborn batch should not hold back the rest of the file, but
        // cancellation and account-level errors stop every worker.
        if (signal?.aborted || error?.terminal) stopped = true;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, groups.length) }, worker),
  );
  if (failure) {
    failure.partial = { ...completed };
    throw failure;
  }
  return completed;
}
