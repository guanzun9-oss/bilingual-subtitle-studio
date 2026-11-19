/**
 * Interface locales and how a request picks one. Kept apart from the
 * dictionaries so the request proxy stays small.
 */
export const LOCALES = [
  { code: "zh-CN", name: "简体中文", target: "zh-Hans", dir: "ltr" },
  { code: "zh-TW", name: "繁體中文", target: "zh-Hant", dir: "ltr" },
  { code: "en", name: "English", target: "es", dir: "ltr" },
  { code: "ja", name: "日本語", target: "ja", dir: "ltr" },
  { code: "ko", name: "한국어", target: "ko", dir: "ltr" },
  { code: "es", name: "Español", target: "es", dir: "ltr" },
  { code: "fr", name: "Français", target: "fr", dir: "ltr" },
  { code: "de", name: "Deutsch", target: "de", dir: "ltr" },
  { code: "pt", name: "Português", target: "pt", dir: "ltr" },
  { code: "ru", name: "Русский", target: "ru", dir: "ltr" },
  { code: "ar", name: "العربية", target: "ar", dir: "rtl" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cuewise-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((entry) => entry.code === value);
}

export function localeInfo(locale: Locale) {
  return LOCALES.find((entry) => entry.code === locale)!;
}

/** Map one Accept-Language tag to a locale, or undefined when none fits. */
function matchTag(tag: string): Locale | undefined {
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) {
    // Traditional script or its regions; everything else reads Simplified.
    return /hant|-tw|-hk|-mo/.test(lower) ? "zh-TW" : "zh-CN";
  }
  const base = lower.split("-")[0];
  return LOCALES.find((entry) => entry.code === base)?.code;
}

/** The best locale for an Accept-Language header, by quality then order. */
export function negotiateLocale(header: string | null | undefined): Locale {
  const ranked = String(header || "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = Number(params.find((param) => param.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const entry of ranked) {
    const locale = matchTag(entry.tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
