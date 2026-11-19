import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  MAX_GLOSSARY_ENTRIES,
  MAX_GLOSSARY_TERM_LENGTH,
  glossaryFor,
} from "@/lib/glossary.mjs";
import { getLanguage, isLanguage } from "@/lib/languages.mjs";
import { DEFAULT_PROVIDER, PROVIDERS, isProvider, resolveModel } from "@/lib/providers.mjs";
import { format, getMessages, type Messages } from "@/lib/i18n";

export const runtime = "edge";

type TranslationItem = {
  id: string;
  text: string;
  context?: string;
  /** Text of the previous source cue, used where the batch does not show it. */
  before?: string;
  /** Length target for the translation, in characters of the target language. */
  maxChars?: number;
  /** Older name of `maxChars`, from when every translation was Chinese. */
  maxChineseChars?: number;
};

type GlossaryEntry = [string, string];

type ParsedTranslation = {
  id: string;
  text: string;
};

type ProviderConfig = {
  label: string;
  kind: "openai" | "anthropic";
  url?: string;
  models: string[];
  extra?: Record<string, unknown>;
  maxTokens?: number;
  maxTokensField?: string;
  jsonMode?: boolean;
};

type Job = {
  provider: string;
  config: ProviderConfig;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  text: Messages["api"];
};

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
  expectedIds: Set<string>,
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
        expectedIds.has(item?.id) &&
        typeof item?.text === "string" &&
        item.text.trim()
      ) {
        result[item.id] = item.text.trim();
      }
    }
  } else if (translations && typeof translations === "object") {
    for (const [id, text] of Object.entries(translations)) {
      if (
        expectedIds.has(id) &&
        typeof text === "string" &&
        text.trim()
      ) {
        result[id] = text.trim();
      }
    }
  }

  return result;
}

/** Instructions for one language pair. Written in English, which every provider follows well. */
function systemPrompt(sourceCode: string, targetCode: string, kind: ProviderConfig["kind"]) {
  const source = getLanguage(sourceCode).english;
  const target = getLanguage(targetCode).english;
  const output = kind === "anthropic"
    ? '{"translations":[{"id":"s0","text":"translation"}]}'
    : '{"translations":{"s0":"translation"}}';
  return [
    `You are a professional film and video subtitle translator from ${source} into ${target}.`,
    'Input JSON: "c" is an array of shared context strings and "s" lists the items.',
    'For each item, "t" is the only text to translate. "c" indexes the original subtitle it was cut from and "b" the previous subtitle; both are context only and must never be translated into this item.',
    `"m" is the maximum length of the translation in ${target} characters, punctuation included. "g" is a glossary (source term: required translation) that must be used.`,
    "Translate item by item: never move, merge or add content from neighbouring items.",
    `Write natural, concise, spoken ${target} on a single line, keep names, terms and tone, and stay within "m" without losing essential meaning.`,
    `Return only a JSON object ${output} containing every id exactly once.`,
  ].join(" ");
}

async function callOpenAiCompatible(job: Job) {
  const { config } = job;
  const response = await fetch(config.url!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${job.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: job.model,
      // This is only an output ceiling, not a reserved-token charge. Keep
      // enough headroom so a valid JSON response is not cut off mid-item.
      [config.maxTokensField || "max_tokens"]: config.maxTokens || 4_000,
      ...(config.jsonMode ? { response_format: { type: "json_object" } } : {}),
      ...config.extra,
      messages: [
        { role: "system", content: job.system },
        { role: "user", content: job.user },
      ],
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = (await response.json()) as unknown;
      // Gemini wraps errors in an array; most providers use { error: { message } }.
      const first = Array.isArray(errorBody) ? errorBody[0] : errorBody;
      const error = (first as { error?: { message?: unknown } | string })?.error;
      detail = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : "";
    } catch {
      // Keep the fallback message below.
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(job.text.invalidKey, 401);
    }
    if (response.status === 429) {
      throw new ApiError(format(job.text.rateLimited, { provider: config.label }), 429);
    }
    throw new ApiError(detail || format(job.text.unavailable, { provider: config.label }), 502);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("missing content");
  return content;
}

// Claude models that accept server-side refusal fallbacks and effort control.
const CLAUDE_FALLBACK = /^claude-(?:opus-5|sonnet-5-5|fable-5|mythos-5)/;
const CLAUDE_EFFORT = /^claude-(?:opus|sonnet|haiku|fable|mythos)-5/;

async function callAnthropic(job: Job) {
  const client = new Anthropic({ apiKey: job.apiKey, maxRetries: 0, timeout: 90_000 });
  try {
    const message = await client.beta.messages.create({
      model: job.model,
      max_tokens: 16_000,
      system: job.system,
      messages: [{ role: "user", content: job.user }],
      output_config: {
        // Short subtitle lines need little deliberation.
        ...(CLAUDE_EFFORT.test(job.model) ? { effort: "low" as const } : {}),
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              translations: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "string" }, text: { type: "string" } },
                  required: ["id", "text"],
                  additionalProperties: false,
                },
              },
            },
            required: ["translations"],
            additionalProperties: false,
          },
        },
      },
      // On a policy decline the API retries the batch on a suitable model.
      ...(CLAUDE_FALLBACK.test(job.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });
    if (message.stop_reason === "refusal") throw new ApiError(job.text.refused, 502);
    const content = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    if (!content) throw new Error("missing content");
    return content;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ApiError(job.text.invalidKey, 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ApiError(format(job.text.rateLimited, { provider: job.config.label }), 429);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new ApiError(format(job.text.connection, { provider: job.config.label }), 502);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ApiError(error.message || format(job.text.unavailable, { provider: job.config.label }), 502);
    }
    throw error;
  }
}

async function requestTranslations(
  base: Omit<Job, "system" | "user"> & { sourceLanguage: string; targetLanguage: string },
  items: Array<Required<Pick<TranslationItem, "id" | "text" | "context" | "maxChars">> & { before?: string }>,
  glossary: GlossaryEntry[],
) {
  let lastError: ApiError | null = null;

  // Context is often identical for several pieces cut from the same sentence.
  // Send it once and use short request-local IDs to reduce input and output tokens.
  const contexts: string[] = [];
  const contextIndexes = new Map<string, number>();
  const indexOfContext = (context: string) => {
    let index = contextIndexes.get(context);
    if (index === undefined) {
      index = contexts.length;
      contexts.push(context);
      contextIndexes.set(context, index);
    }
    return index;
  };
  // Neighbouring items in a batch already show how a sentence continues
  // across cues. Send the previous cue only where the batch starts or skips
  // ahead, and never the next one, which invites translating it early.
  const shown = new Set<string>();
  const idMap = new Map<string, string>();
  const compactItems = items.map((item, index) => {
    const id = `s${index}`;
    const context = item.context || item.text;
    const contextIndex = context !== item.text ? indexOfContext(context) : undefined;
    const beforeIndex = item.before && !shown.has(item.before)
      ? indexOfContext(item.before)
      : undefined;
    if (item.before) shown.add(item.before);
    shown.add(context);
    idMap.set(id, item.id);
    return {
      id,
      t: item.text,
      c: contextIndex,
      b: beforeIndex,
      m: item.maxChars,
    };
  });
  const terms = glossaryFor(glossary, [...items.map((item) => item.text), ...contexts]);
  const job: Job = {
    ...base,
    system: systemPrompt(base.sourceLanguage, base.targetLanguage, base.config.kind),
    user: JSON.stringify({
      c: contexts,
      s: compactItems,
      ...(terms.length ? { g: Object.fromEntries(terms) } : {}),
    }),
  };
  const label = base.config.label;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const content = base.config.kind === "anthropic"
        ? await callAnthropic(job)
        : await callOpenAiCompatible(job);

      // m is a translation-quality target, not a transport-validity rule.
      // Models may exceed it by a few characters; discarding such a valid
      // result makes the same cue retry forever.
      const expectedIds = new Set(compactItems.map((item) => item.id));
      const compactTranslations = normalizeTranslations(
        extractJson(content),
        expectedIds,
      );
      const parsed = Object.fromEntries(
        Object.entries(compactTranslations).map(([id, text]) => [
          idMap.get(id)!,
          text,
        ]),
      );
      if (Object.keys(parsed).length) return parsed;
      lastError = new ApiError(base.text.badFormat, 502);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      lastError =
        error instanceof ApiError
          ? error
          : error instanceof SyntaxError || (error instanceof Error && /json|content/.test(error.message))
            ? new ApiError(base.text.badFormat, 502)
            : new ApiError(format(base.text.connection, { provider: label }), 502);
    }

    if (attempt < 2) await delay(700 * 2 ** attempt);
  }

  throw lastError || new ApiError(format(base.text.failed, { provider: label }), 502);
}

export async function POST(request: Request) {
  let body: {
    apiKey?: string;
    provider?: string;
    model?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    locale?: string;
    items?: TranslationItem[];
    glossary?: unknown;
  };

  let text = getMessages("zh-CN").api;
  try {
    body = await request.json();
  } catch {
    return jsonError(text.unreadable, 400);
  }
  text = getMessages(body.locale).api;

  const provider = body.provider === undefined ? DEFAULT_PROVIDER : body.provider;
  if (!isProvider(provider)) return jsonError(text.invalidProvider, 400);
  const config = (PROVIDERS as Record<string, unknown>)[provider] as ProviderConfig;
  const sourceLanguage = body.sourceLanguage ?? "en";
  const targetLanguage = body.targetLanguage ?? "zh-Hans";
  if (!isLanguage(sourceLanguage) || !isLanguage(targetLanguage) || sourceLanguage === targetLanguage) {
    return jsonError(text.invalidLanguage, 400);
  }

  const apiKey = body.apiKey?.trim();
  const model = resolveModel(provider, body.model);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!apiKey) return jsonError(format(text.missingKey, { provider: config.label }), 400);
  if (!items.length || items.length > 24) {
    return jsonError(text.batchSize, 400);
  }

  const validLength = (value: unknown) =>
    value === undefined ||
    (Number.isInteger(value) && (value as number) >= 8 && (value as number) <= 100);
  const safeItems = items
    .filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.text === "string" &&
        item.id.length <= 100 &&
        item.text.length <= 2_000 &&
        validLength(item.maxChars) &&
        validLength(item.maxChineseChars) &&
        (item.context === undefined ||
          (typeof item.context === "string" && item.context.length <= 4_000)) &&
        (item.before === undefined ||
          (typeof item.before === "string" && item.before.length <= 4_000)),
    )
    .map((item) => ({
      id: item.id,
      text: item.text.trim(),
      context: item.context?.trim() || item.text.trim(),
      before: item.before?.trim() || undefined,
      maxChars: item.maxChars || item.maxChineseChars || 32,
    }));

  if (safeItems.length !== items.length || safeItems.some((item) => !item.text)) {
    return jsonError(text.invalidItems, 400);
  }

  const glossaryInput = body.glossary ?? [];
  const isEntry = (entry: unknown): entry is GlossaryEntry =>
    Array.isArray(entry) &&
    entry.length === 2 &&
    entry.every(
      (term) =>
        typeof term === "string" &&
        term.trim() !== "" &&
        term.length <= MAX_GLOSSARY_TERM_LENGTH,
    );
  if (
    !Array.isArray(glossaryInput) ||
    glossaryInput.length > MAX_GLOSSARY_ENTRIES ||
    !glossaryInput.every(isEntry)
  ) {
    return jsonError(text.invalidGlossary, 400);
  }
  const glossary: GlossaryEntry[] = glossaryInput;

  const translations: Record<string, string> = {};
  let remaining = safeItems;
  const base = { provider, config, apiKey, model, text, sourceLanguage, targetLanguage };

  try {
    // If a response omits one or two IDs, retry only those IDs in a smaller
    // repair request instead of failing the whole batch.
    for (let round = 0; round < 3 && remaining.length; round += 1) {
      const translated = await requestTranslations(base, remaining, glossary);
      Object.assign(translations, translated);
      remaining = remaining.filter((item) => !translations[item.id]);
    }
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(format(text.failed, { provider: config.label }), 502);
    return jsonError(apiError.message, apiError.status, translations);
  }

  if (remaining.length) {
    return jsonError(
      format(text.missing, { count: remaining.length }),
      502,
      translations,
    );
  }

  return NextResponse.json(
    { translations },
    { headers: { "Cache-Control": "no-store" } },
  );
}
