import { NextResponse } from "next/server";

export const runtime = "edge";

type TranslationItem = {
  id: string;
  text: string;
  context?: string;
  maxChineseChars?: number;
};

type ParsedTranslation = {
  id: string;
  text: string;
};

const ALLOWED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

class ApiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function jsonError(
  message: string,
  status: number,
  translations: Record<string, string> = {},
) {
  return NextResponse.json(
    { error: message, translations },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    }
    throw new Error("invalid json");
  }
}

function normalizeTranslations(
  value: unknown,
  expectedLimits: Map<string, number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== "object") return result;

  const object = value as {
    translations?: ParsedTranslation[] | Record<string, string>;
  };
  const translations = object.translations;

  if (Array.isArray(translations)) {
    for (const item of translations) {
      if (
        expectedLimits.has(item?.id) &&
        typeof item?.text === "string" &&
        item.text.trim() &&
        Array.from(item.text.replace(/\s/g, "")).length <=
          expectedLimits.get(item.id)!
      ) {
        result[item.id] = item.text.trim();
      }
    }
  } else if (translations && typeof translations === "object") {
    for (const [id, text] of Object.entries(translations)) {
      if (
        expectedLimits.has(id) &&
        typeof text === "string" &&
        text.trim() &&
        Array.from(text.replace(/\s/g, "")).length <= expectedLimits.get(id)!
      ) {
        result[id] = text.trim();
      }
    }
  }

  return result;
}

async function requestDeepSeek(
  apiKey: string,
  model: string,
  items: TranslationItem[],
) {
  let lastError: ApiError | null = null;

  // Context is often identical for several pieces cut from the same sentence.
  // Send it once and use short request-local IDs to reduce input and output tokens.
  const contexts: string[] = [];
  const contextIndexes = new Map<string, number>();
  const idMap = new Map<string, string>();
  const compactItems = items.map((item, index) => {
    const id = `s${index}`;
    const context = item.context || item.text;
    let contextIndex: number | undefined;
    if (context !== item.text) {
      contextIndex = contextIndexes.get(context);
      if (contextIndex === undefined) {
        contextIndex = contexts.length;
        contexts.push(context);
        contextIndexes.set(context, contextIndex);
      }
    }
    idMap.set(id, item.id);
    return {
      id,
      t: item.text,
      c: contextIndex,
      m: item.maxChineseChars || 32,
    };
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          thinking: { type: "disabled" },
          temperature: 0,
          max_tokens: 2_200,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "专业影视字幕英译简中。输入中 c 是共享上下文数组，s 是条目；每项 t 才是待译文本，c 索引仅供理解，m 是含标点的中文字符上限。逐项严格对齐，不移动、合并或补写相邻内容。译文自然口语化、精炼且不换行，保留人名、术语和语气，在不遗漏核心信息下严格满足 m。只返回 JSON 对象：{\"translations\":{\"s0\":\"译文\"}}，每个 id 恰好一次。",
            },
            {
              role: "user",
              content: JSON.stringify({ c: contexts, s: compactItems }),
            },
          ],
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errorBody = (await response.json()) as {
            error?: { message?: string };
          };
          detail = errorBody.error?.message || "";
        } catch {
          // Keep the fallback message below.
        }

        if (response.status === 401 || response.status === 403) {
          throw new ApiError("API Key 无效或没有访问权限，请检查后重试。", 401);
        }
        if (response.status === 429) {
          lastError = new ApiError(
            "DeepSeek 请求过于频繁或余额不足，请稍后重试。",
            429,
          );
        } else {
          lastError = new ApiError(
            detail || "DeepSeek 暂时无法完成这一批翻译。",
            502,
          );
        }
      } else {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("missing content");

        const expectedLimits = new Map(
          compactItems.map((item) => [item.id, item.m]),
        );
        const compactTranslations = normalizeTranslations(
          extractJson(content),
          expectedLimits,
        );
        const parsed = Object.fromEntries(
          Object.entries(compactTranslations).map(([id, text]) => [
            idMap.get(id)!,
            text,
          ]),
        );
        if (Object.keys(parsed).length) return parsed;
        lastError = new ApiError("翻译结果格式异常。", 502);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      lastError =
        error instanceof ApiError
          ? error
          : new ApiError("暂时无法连接 DeepSeek，请稍后再试。", 502);
    }

    if (attempt < 2) await delay(700 * 2 ** attempt);
  }

  throw lastError || new ApiError("DeepSeek 翻译失败。", 502);
}

export async function POST(request: Request) {
  let body: {
    apiKey?: string;
    model?: string;
    items?: TranslationItem[];
  };

  try {
    body = await request.json();
  } catch {
    return jsonError("请求内容无法读取。", 400);
  }

  const apiKey = body.apiKey?.trim();
  const model = ALLOWED_MODELS.has(body.model || "")
    ? body.model!
    : "deepseek-v4-flash";
  const items = Array.isArray(body.items) ? body.items : [];

  if (!apiKey) return jsonError("请填写 DeepSeek API Key。", 400);
  if (!items.length || items.length > 24) {
    return jsonError("每批字幕数量需要在 1 到 24 条之间。", 400);
  }

  const safeItems = items
    .filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.text === "string" &&
        item.id.length <= 100 &&
        item.text.length <= 2_000 &&
        (item.maxChineseChars === undefined ||
          (Number.isInteger(item.maxChineseChars) &&
            item.maxChineseChars >= 8 &&
            item.maxChineseChars <= 32)) &&
        (item.context === undefined ||
          (typeof item.context === "string" && item.context.length <= 4_000)),
    )
    .map((item) => ({
      id: item.id,
      text: item.text.trim(),
      context: item.context?.trim() || item.text.trim(),
      maxChineseChars: item.maxChineseChars || 32,
    }));

  if (safeItems.length !== items.length || safeItems.some((item) => !item.text)) {
    return jsonError("有字幕内容不符合要求。", 400);
  }

  const translations: Record<string, string> = {};
  let remaining = safeItems;

  try {
    // If a response omits one or two IDs, retry only those IDs in a smaller
    // repair request instead of failing the whole batch.
    for (let round = 0; round < 3 && remaining.length; round += 1) {
      const translated = await requestDeepSeek(apiKey, model, remaining);
      Object.assign(translations, translated);
      remaining = remaining.filter((item) => !translations[item.id]);
    }
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError("DeepSeek 翻译失败，请稍后重试。", 502);
    return jsonError(apiError.message, apiError.status, translations);
  }

  if (remaining.length) {
    return jsonError(
      `还有 ${remaining.length} 条未返回，工具会自动继续重试。`,
      502,
      translations,
    );
  }

  return NextResponse.json(
    { translations },
    { headers: { "Cache-Control": "no-store" } },
  );
}
