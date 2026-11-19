/**
 * Translation providers the site can forward to with the reader's own key.
 *
 * Every provider except Anthropic speaks the OpenAI Chat Completions format,
 * so one request shape covers them; `extra` holds the few provider-specific
 * fields. Model lists are suggestions: providers rename models often, so any
 * model name the provider accepts can be typed in. Endpoints are fixed here
 * on purpose: the server never forwards a key to an address from a request.
 */

export const PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    kind: "openai",
    url: "https://api.deepseek.com/chat/completions",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyHint: "sk-…",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    // DeepSeek offers only these, so any other name falls back to the first.
    strictModels: true,
    // Thinking adds latency without helping short subtitle lines.
    extra: { thinking: { type: "disabled" }, temperature: 0 },
    maxTokens: 4_000,
    jsonMode: true,
  },
  openai: {
    label: "OpenAI",
    kind: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    models: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
    // Reasoning models reject `max_tokens` and custom temperatures.
    maxTokensField: "max_completion_tokens",
    maxTokens: 16_000,
    jsonMode: true,
  },
  anthropic: {
    label: "Anthropic Claude",
    kind: "anthropic",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyHint: "sk-ant-…",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  gemini: {
    label: "Google Gemini",
    kind: "openai",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    models: ["gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest"],
    maxTokens: 16_000,
    jsonMode: true,
  },
  openrouter: {
    label: "OpenRouter",
    kind: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-…",
    // One key for most public models; "openrouter/auto" picks one.
    models: ["openrouter/auto", "openai/gpt-5.6-terra", "google/gemini-3.8-flash", "deepseek/deepseek-v4-flash"],
    maxTokens: 16_000,
    jsonMode: true,
  },
  qwen: {
    label: "通义千问 Qwen（中国站）",
    kind: "openai",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    keyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    keyHint: "sk-…",
    models: ["qwen-plus", "qwen-flash", "qwen-max"],
    extra: { temperature: 0 },
    maxTokens: 8_000,
    jsonMode: true,
  },
  "qwen-intl": {
    label: "Qwen (International)",
    kind: "openai",
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
    keyHint: "sk-…",
    models: ["qwen-plus", "qwen-flash", "qwen-max"],
    extra: { temperature: 0 },
    maxTokens: 8_000,
    jsonMode: true,
  },
  moonshot: {
    label: "Kimi 月之暗面",
    kind: "openai",
    url: "https://api.moonshot.cn/v1/chat/completions",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    keyHint: "sk-…",
    models: ["kimi-k2.6", "kimi-k3"],
    maxTokens: 8_000,
    jsonMode: true,
  },
  zhipu: {
    label: "智谱 GLM",
    kind: "openai",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    keyHint: "…",
    models: ["glm-5.3-flash", "glm-5.3"],
    extra: { thinking: { type: "disabled" } },
    maxTokens: 8_000,
    jsonMode: true,
  },
  mistral: {
    label: "Mistral AI",
    kind: "openai",
    url: "https://api.mistral.ai/v1/chat/completions",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyHint: "…",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    extra: { temperature: 0 },
    maxTokens: 8_000,
    jsonMode: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);
export const DEFAULT_PROVIDER = "deepseek";

export function isProvider(id) {
  return typeof id === "string" && Object.hasOwn(PROVIDERS, id);
}

// Model names are letters, digits and . _ - : / @, as providers use them.
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/;

export function isModelName(model) {
  return typeof model === "string" && MODEL_NAME.test(model);
}

/** The model to use: the requested one when it is a plausible name, else the provider's first. */
export function resolveModel(provider, model) {
  const config = PROVIDERS[isProvider(provider) ? provider : DEFAULT_PROVIDER];
  const name = typeof model === "string" ? model.trim() : "";
  if (config.strictModels) return config.models.includes(name) ? name : config.models[0];
  return isModelName(name) ? name : config.models[0];
}
