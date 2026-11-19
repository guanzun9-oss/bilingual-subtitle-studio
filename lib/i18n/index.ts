/**
 * Interface languages. Each locale has its own URL (/en, /ja, …); `/` sends
 * the reader to the best match for their browser (see proxy.ts).
 */
import ar from "./ar";
import de from "./de";
import en from "./en";
import es from "./es";
import fr from "./fr";
import ja from "./ja";
import ko from "./ko";
import pt from "./pt";
import ru from "./ru";
import zhCN from "./zh-CN";
import zhTW from "./zh-TW";
import { isLocale, type Locale } from "./locales";

export type Messages = typeof zhCN;

export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, localeInfo, negotiateLocale } from "./locales";
export type { Locale } from "./locales";

const MESSAGES: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en,
  ja,
  ko,
  es,
  fr,
  de,
  pt,
  ru,
  ar,
};

/** Messages for `locale`; unknown values get Simplified Chinese, the site's original language. */
export function getMessages(locale: unknown): Messages {
  return isLocale(locale) ? MESSAGES[locale] : zhCN;
}

/** Fill {name} placeholders. Unknown names are left as they are. */
export function format(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
