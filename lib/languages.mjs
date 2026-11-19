/**
 * Subtitle languages: how each one is split, wrapped, measured and named.
 *
 * `lineChars` is the landscape line width in characters and `cps` the adult
 * reading speed in characters per second. English (42/20) and Chinese (16/9)
 * follow Netflix's language guides (see docs/subtitle-rules.md); the other
 * values are this tool's presets in the same spirit. They only drive advisory
 * warnings and wrapping; a translation is never rejected because of them.
 *
 * `spaced` is false for scripts written without spaces between words, which
 * are measured, split and wrapped character by character.
 */

/**
 * @typedef {object} Language
 * @property {string} code BCP 47 code
 * @property {string} name Name in the language itself
 * @property {string} english English name, used in translation instructions
 * @property {boolean} spaced Whether words are separated by spaces
 * @property {number} lineChars Landscape line width in characters
 * @property {number} cps Adult reading speed in characters per second
 * @property {boolean} [rtl] Written right to left
 */

const LATIN = { spaced: true, lineChars: 42, cps: 17 };

/** @type {Language[]} */
export const LANGUAGES = [
  { code: "en", name: "English", english: "English", ...LATIN, cps: 20 },
  { code: "zh-Hans", name: "简体中文", english: "Simplified Chinese", spaced: false, lineChars: 16, cps: 9 },
  { code: "zh-Hant", name: "繁體中文", english: "Traditional Chinese", spaced: false, lineChars: 16, cps: 9 },
  { code: "ja", name: "日本語", english: "Japanese", spaced: false, lineChars: 13, cps: 4 },
  { code: "ko", name: "한국어", english: "Korean", spaced: true, lineChars: 16, cps: 12 },
  { code: "es", name: "Español", english: "Spanish", ...LATIN },
  { code: "fr", name: "Français", english: "French", ...LATIN },
  { code: "de", name: "Deutsch", english: "German", ...LATIN },
  { code: "pt", name: "Português", english: "Portuguese", ...LATIN },
  { code: "it", name: "Italiano", english: "Italian", ...LATIN },
  { code: "nl", name: "Nederlands", english: "Dutch", ...LATIN },
  { code: "pl", name: "Polski", english: "Polish", ...LATIN },
  { code: "sv", name: "Svenska", english: "Swedish", ...LATIN },
  { code: "tr", name: "Türkçe", english: "Turkish", ...LATIN },
  { code: "ru", name: "Русский", english: "Russian", ...LATIN },
  { code: "uk", name: "Українська", english: "Ukrainian", ...LATIN },
  { code: "ar", name: "العربية", english: "Arabic", ...LATIN, rtl: true },
  { code: "he", name: "עברית", english: "Hebrew", ...LATIN, rtl: true },
  { code: "fa", name: "فارسی", english: "Persian", ...LATIN, rtl: true },
  { code: "hi", name: "हिन्दी", english: "Hindi", ...LATIN },
  { code: "th", name: "ไทย", english: "Thai", spaced: true, lineChars: 35, cps: 15 },
  { code: "vi", name: "Tiếng Việt", english: "Vietnamese", ...LATIN },
  { code: "id", name: "Bahasa Indonesia", english: "Indonesian", ...LATIN },
  { code: "ms", name: "Bahasa Melayu", english: "Malay", ...LATIN },
];

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export const LANGUAGE_CODES = LANGUAGES.map((language) => language.code);

/**
 * @param {unknown} code
 * @returns {code is string}
 */
export function isLanguage(code) {
  return typeof code === "string" && BY_CODE.has(code);
}

/**
 * The language for `code`, or English when it is not supported.
 * @param {unknown} code
 * @returns {Language}
 */
export function getLanguage(code) {
  return BY_CODE.get(/** @type {string} */ (code)) ?? /** @type {Language} */ (BY_CODE.get("en"));
}

/** Line width for a frame: portrait is about three quarters of landscape (42 → 32, 16 → 12). */
export function lineCharsFor(code, frame = "landscape") {
  const { lineChars } = getLanguage(code);
  return frame === "portrait" ? Math.round(lineChars * 0.76) : lineChars;
}

/**
 * Character budget for one translated cue: at most two lines, and no more
 * than the reading speed allows for its duration, never below 8.
 */
export function maxTranslationChars(durationMs, code, frame = "landscape") {
  const language = getLanguage(code);
  const twoLines = lineCharsFor(code, frame) * 2;
  return Math.max(8, Math.min(twoLines, Math.floor((durationMs / 1000) * language.cps)));
}

// Letters of scripts written without spaces between words.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** Whether `text` uses a script that separates words with spaces (used for glossary matching). */
export function isSpacedText(text) {
  return !UNSPACED.test(text);
}

const STOPWORDS = {
  en: ["the", "and", "you", "that", "is", "it", "to", "of", "what", "this", "we", "i", "was", "have", "are", "with", "for", "not"],
  es: ["el", "la", "que", "de", "y", "es", "los", "las", "por", "una", "para", "con", "pero", "muy", "está", "qué", "yo", "lo"],
  fr: ["le", "la", "les", "et", "est", "que", "je", "vous", "pas", "une", "des", "dans", "c'est", "nous", "il", "pour", "qui", "du"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ich", "sie", "es", "ein", "eine", "wir", "zu", "mit", "auf", "den", "auch", "was"],
  pt: ["o", "a", "que", "de", "e", "não", "é", "um", "uma", "para", "com", "os", "eu", "você", "isso", "mas", "do", "da"],
  it: ["il", "che", "di", "e", "la", "non", "è", "un", "una", "per", "sono", "ho", "mi", "lo", "ma", "questo", "gli", "con"],
  nl: ["de", "het", "een", "en", "is", "niet", "ik", "je", "dat", "van", "wat", "we", "zijn", "met", "op", "maar", "dit", "er"],
  pl: ["nie", "to", "się", "jest", "że", "na", "i", "w", "co", "jak", "ale", "tak", "mnie", "ja", "czy", "do", "go", "już"],
  sv: ["och", "det", "är", "att", "jag", "inte", "en", "på", "som", "du", "har", "med", "för", "vi", "vad", "den", "så", "ett"],
  tr: ["bir", "ve", "bu", "da", "ne", "değil", "ben", "için", "çok", "mi", "o", "sen", "ama", "var", "gibi", "şey", "daha", "evet"],
  id: ["yang", "dan", "ini", "itu", "tidak", "aku", "saya", "kamu", "apa", "di", "ke", "akan", "ada", "dengan", "untuk", "bisa", "sudah", "kita"],
  vi: ["không", "là", "của", "và", "có", "tôi", "một", "những", "này", "được", "người", "anh", "em", "cho", "với", "đã", "chúng", "các"],
};

/**
 * A best guess at the language of subtitle text from its script and common
 * words, or "" when it cannot tell. Only used to preselect the source
 * language; the user can always change it.
 */
/**
 * @param {string} text
 * @returns {string}
 */
export function guessLanguage(text) {
  const sample = String(text || "").slice(0, 20_000);
  const count = (pattern) => (sample.match(pattern) || []).length;
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  const scripts = [
    ["ko", count(/\p{Script=Hangul}/gu)],
    ["ja", kana ? kana + han : 0],
    ["zh", kana ? 0 : han],
    ["ru", count(/\p{Script=Cyrillic}/gu)],
    ["ar", count(/\p{Script=Arabic}/gu)],
    ["he", count(/\p{Script=Hebrew}/gu)],
    ["hi", count(/\p{Script=Devanagari}/gu)],
    ["th", count(/\p{Script=Thai}/gu)],
  ];
  const letters = count(/\p{L}/gu);
  if (!letters) return "";
  const [script, total] = scripts.sort((a, b) => b[1] - a[1])[0];
  if (total / letters > 0.3) {
    if (script === "zh") {
      // Characters common in one form and absent from the other.
      const traditional = count(/[們這個來說時會對後國過還裡麼樣為點開與給從]/gu);
      const simplified = count(/[们这个来说时会对后国过还里么样为点开与给从]/gu);
      return traditional > simplified ? "zh-Hant" : "zh-Hans";
    }
    if (script === "ru") return /[іїєґ]/i.test(sample) ? "uk" : "ru";
    if (script === "ar") return /[پچژگ]/.test(sample) ? "fa" : "ar";
    return script;
  }

  const words = sample.toLowerCase().match(/[\p{L}']+/gu) || [];
  let best = "";
  let bestScore = 0;
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    const score = words.filter((word) => set.has(word)).length;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return bestScore >= 3 && bestScore / words.length > 0.08 ? best : "";
}
