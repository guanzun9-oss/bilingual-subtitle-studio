import { NextResponse } from "next/server";

export const runtime = "edge";

type TranslationItem = {
  id: string;
  text: string;
};

const ALLOWED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function cleanJsonContent(content: string) {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
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
  if (!items.length || items.length > 50) {
    return jsonError("每批字幕数量需要在 1 到 50 条之间。", 400);
  }

  const safeItems = items
    .filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.text === "string" &&
        item.id.length <= 100 &&
        item.text.length <= 1_500,
    )
    .map((item) => ({ id: item.id, text: item.text.trim() }));

  if (safeItems.length !== items.length || safeItems.some((item) => !item.text)) {
    return jsonError("有字幕内容不符合要求。", 400);
  }

  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        thinking: { type: "disabled" },
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是专业影视字幕译者。把英文字幕自然、简洁地翻译成简体中文。保留人名、术语、语气和标记；不要解释，不要合并或拆分条目。必须返回 JSON：{\"translations\":[{\"id\":\"原id\",\"text\":\"中文\"}]}，并确保每个输入 id 恰好出现一次。",
          },
          {
            role: "user",
            content: JSON.stringify({ subtitles: safeItems }),
          },
        ],
      }),
    });
  } catch {
    return jsonError("暂时无法连接 DeepSeek，请稍后再试。", 502);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = (await response.json()) as {
        error?: { message?: string };
      };
      detail = errorBody.error?.message || "";
    } catch {
      // Keep the user-facing fallback concise.
    }

    if (response.status === 401 || response.status === 403) {
      return jsonError("API Key 无效或没有访问权限，请检查后重试。", 401);
    }
    if (response.status === 429) {
      return jsonError("DeepSeek 请求过于频繁或余额不足，请稍后重试。", 429);
    }
    return jsonError(detail || "DeepSeek 翻译失败，请稍后重试。", 502);
  }

  try {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("missing content");

    const parsed = JSON.parse(cleanJsonContent(content)) as {
      translations?: TranslationItem[];
    };
    const translated = Array.isArray(parsed.translations)
      ? parsed.translations
      : [];
    const expectedIds = new Set(safeItems.map((item) => item.id));
    const result: Record<string, string> = {};

    for (const item of translated) {
      if (
        expectedIds.has(item?.id) &&
        typeof item?.text === "string" &&
        item.text.trim()
      ) {
        result[item.id] = item.text.trim();
      }
    }

    if (Object.keys(result).length !== safeItems.length) {
      throw new Error("incomplete translations");
    }

    return NextResponse.json(
      { translations: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("翻译结果格式异常，请重试这一批字幕。", 502);
  }
}
