/**
 * Dependency-free SRT helpers shared by the browser and the test suite.
 *
 * Splitting and wrapping follow the subtitle's language (see languages.mjs):
 * English keeps its grammar-aware rules, other spaced languages break at
 * punctuation, conjunctions and spaces, and scripts written without spaces
 * (Chinese, Japanese) break between characters.
 */

import { getLanguage } from "./languages.mjs";

/**
 * Errors carry a stable `code` so the interface can show them in the
 * reader's language: "empty-file", "no-timing", "cue-too-short",
 * "negative-time".
 */
export class SubtitleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SubtitleError";
    this.code = code;
  }
}

const TIMING_LINE =
  /^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/;

function timestampToMs(parts, offset) {
  return (
    Number(parts[offset]) * 3_600_000 +
    Number(parts[offset + 1]) * 60_000 +
    Number(parts[offset + 2]) * 1_000 +
    Number(parts[offset + 3])
  );
}

export function parseSrt(input) {
  const normalized = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalized) throw new SubtitleError("empty-file", "The subtitle file is empty.");

  // Cues are delimited by their timing lines rather than blank lines: some
  // exporters leave spaces on the "blank" line or omit it entirely.
  const lines = normalized.split("\n");
  const cues = [];
  let current = null;

  const finishCue = () => {
    if (!current) return;
    const text = current.lines.join(" ").replace(/\s+/g, " ").trim();
    if (text && current.endMs > current.startMs) {
      cues.push({
        id: `cue-${cues.length + 1}`,
        sourceId: `source-${cues.length + 1}`,
        startMs: current.startMs,
        endMs: current.endMs,
        text,
      });
    }
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(TIMING_LINE);
    if (match) {
      finishCue();
      current = { startMs: timestampToMs(match, 1), endMs: timestampToMs(match, 5), lines: [] };
      continue;
    }
    if (!current) continue;
    // The next cue's number sits directly before its timing line.
    const nextIsTiming = TIMING_LINE.test(lines[index + 1] ?? "");
    if (nextIsTiming && /^\s*\d+\s*$/.test(lines[index])) continue;
    current.lines.push(lines[index]);
  }
  finishCue();

  if (!cues.length) {
    throw new SubtitleError("no-timing", "No valid SRT timings were found.");
  }

  return cues;
}

// Includes the Arabic question mark, the Devanagari danda and the Urdu full stop.
const SENTENCE_PUNCTUATION = /[.!?。．｡！？…⋯؟।॥۔]/;
const CLOSING_PUNCTUATION = /["'’”»）)\]】」』]/;
const CLAUSE_PUNCTUATION = /[,，、、—–،]/;
const PAUSE_PUNCTUATION = /[;:；：؛]/;

/**
 * Word lists for grammar-aware breaks. English is the most complete; the
 * others cover articles, prepositions and pronouns that read badly at the end
 * of a line, and conjunctions that start a natural new line.
 */
const GRAMMAR = {
  en: {
    titles: /\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|Gen|Lt|Col|Capt|Sgt|St|vs|cf|Fig|No)\.$/i,
    nameTitles: /^(?:Mr|Mrs|Ms|Dr|Prof|Rev|Gen|Lt|Col|Capt|Sgt|St)\.$/i,
    conjunctions: ["and", "but", "or", "so", "because", "while", "when", "if", "which", "who", "that", "as"],
    articles: ["a", "an", "the"],
    prepositions: ["to", "of", "in", "for", "with", "at", "by", "from", "into", "on", "under", "over", "about"],
    dependent: ["a", "an", "the", "my", "your", "his", "her", "its", "our", "their", "to", "of", "in", "for", "with", "at", "by", "from", "into", "on", "under", "over", "about", "and", "but", "or", "because", "if", "while", "when", "I", "you", "he", "she", "it", "we", "they", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "can", "could", "will", "would", "shall", "should", "may", "might", "must", "not", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "won't", "can't"],
    names: true,
  },
  es: {
    titles: /(?:^|[\s¿¡(])(?:Sr|Sra|Srta|Dr|Dra|Ud|Uds|Lic|Ing|etc)\.$/i,
    conjunctions: ["y", "e", "pero", "o", "u", "porque", "que", "cuando", "si", "aunque", "mientras", "pues"],
    articles: ["el", "la", "los", "las", "un", "una", "unos", "unas"],
    prepositions: ["a", "de", "en", "con", "por", "para", "sin", "sobre", "entre", "hacia", "desde", "hasta"],
    dependent: ["el", "la", "los", "las", "un", "una", "a", "al", "de", "del", "en", "con", "por", "para", "y", "o", "que", "mi", "tu", "su", "mis", "tus", "sus", "lo", "se", "me", "te", "no", "yo"],
  },
  fr: {
    titles: /(?:^|[\s(«])(?:M|MM|Mme|Mlle|Dr|Pr|St|Ste|etc)\.$/i,
    conjunctions: ["et", "mais", "ou", "donc", "car", "parce", "que", "quand", "si", "lorsque", "puisque", "comme"],
    articles: ["le", "la", "les", "un", "une", "des", "du"],
    prepositions: ["à", "de", "en", "dans", "avec", "pour", "par", "sur", "sous", "sans", "chez", "vers"],
    dependent: ["le", "la", "les", "un", "une", "des", "du", "de", "à", "au", "aux", "en", "dans", "avec", "pour", "par", "et", "ou", "que", "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "ne", "mon", "ton", "son", "ma", "ta", "sa", "mes", "tes", "ses", "ce", "cette"],
  },
  de: {
    titles: /(?:^|[\s(„])(?:Hr|Fr|Dr|Prof|St|z\.B|bzw|usw|ca|Nr)\.$/i,
    conjunctions: ["und", "aber", "oder", "denn", "weil", "dass", "wenn", "als", "ob", "obwohl", "sondern", "damit"],
    articles: ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer"],
    prepositions: ["zu", "von", "mit", "für", "in", "an", "auf", "aus", "bei", "nach", "über", "unter", "um", "durch", "gegen", "ohne"],
    dependent: ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "zu", "von", "mit", "für", "in", "im", "an", "am", "auf", "aus", "bei", "und", "oder", "ich", "du", "er", "sie", "es", "wir", "ihr", "mein", "dein", "sein", "nicht"],
  },
  pt: {
    titles: /(?:^|[\s(])(?:Sr|Sra|Srta|Dr|Dra|etc)\.$/i,
    conjunctions: ["e", "mas", "ou", "porque", "que", "quando", "se", "embora", "pois", "enquanto"],
    articles: ["o", "a", "os", "as", "um", "uma", "uns", "umas"],
    prepositions: ["de", "em", "com", "por", "para", "sem", "sobre", "entre", "até", "desde"],
    dependent: ["o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "em", "no", "na", "com", "por", "para", "e", "ou", "que", "eu", "meu", "minha", "seu", "sua", "não", "se", "me", "te"],
  },
  it: {
    titles: /(?:^|[\s(])(?:Sig|Sigg|Dott|Prof|Avv|Ing|ecc)\.$/i,
    conjunctions: ["e", "ma", "o", "perché", "che", "quando", "se", "mentre", "anche", "però", "quindi"],
    articles: ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una"],
    prepositions: ["di", "a", "da", "in", "con", "su", "per", "tra", "fra"],
    dependent: ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "del", "della", "a", "al", "alla", "da", "in", "nel", "nella", "con", "su", "per", "e", "o", "che", "io", "tu", "mio", "tuo", "suo", "non", "mi", "ti", "si"],
  },
};

const WORD_END = "(?![\\p{L}\\p{N}])";
const compiled = new Map();

function wordList(words, end = WORD_END) {
  return words?.length ? new RegExp(`^(?:${words.join("|")})${end}`, "iu") : null;
}

/** The splitting rules for a language code, compiled once. */
function rulesFor(code = "en") {
  const language = getLanguage(code);
  if (compiled.has(language.code)) return compiled.get(language.code);
  const grammar = GRAMMAR[language.code] || {};
  const rules = {
    code: language.code,
    spaced: language.spaced,
    titles: grammar.titles,
    nameTitles: grammar.nameTitles,
    names: Boolean(grammar.names),
    conjunctions: wordList(grammar.conjunctions),
    articles: wordList(grammar.articles),
    prepositions: wordList(grammar.prepositions),
    // Whole words only: "that's" is not "that".
    breakBefore: wordList([...(grammar.conjunctions || []), ...(grammar.articles || [])], "(?![\\p{L}\\p{N}'’])"),
    dependent: grammar.dependent
      ? new RegExp(`^(?:${grammar.dependent.join("|")})$`, "iu")
      : null,
  };
  compiled.set(language.code, rules);
  return rules;
}

function isSentenceEnd(text, index, rules = rulesFor("en")) {
  const character = text[index];
  if (!SENTENCE_PUNCTUATION.test(character)) return false;
  const isEllipsis = /[…⋯]/.test(character) ||
    (character === "." && (text[index + 1] === "." || text[index - 1] === "."));
  if (isEllipsis) {
    let end = index + 1;
    while (/[.…⋯]/.test(text[end] || "")) end += 1;
    while (CLOSING_PUNCTUATION.test(text[end] || "")) end += 1;
    const continuation = text.slice(end).trimStart();
    // Ellipses can mark hesitation inside a sentence. With text alone, keep
    // ambiguous continuations together rather than inventing a sentence end.
    return /[\p{L}\p{N}]/u.test(text.slice(0, index)) &&
      (!continuation || /^[\p{Lu}.!?。．｡！？¿¡]/u.test(continuation));
  }
  if (character !== ".") return true;

  // A decimal point, title, or initial is not the end of a spoken sentence.
  if (/\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "")) {
    return false;
  }
  const before = text.slice(0, index + 1);
  const after = text.slice(index + 1).trimStart();
  if (!after) return true;
  if (rules.titles?.test(before)) return false;

  const initials = before.match(/(?:^|[\s("'“‘])((?:\p{L}\.)+)$/u)?.[1];
  if (initials) {
    // Keep U.S., U.K., e.g., i.e., and names such as J. R. Smith intact.
    if (/^\p{L}\./u.test(text.slice(index + 1))) return false;
    if (/^(?:e\.g\.|i\.e\.)$/i.test(initials)) return false;
    if (rules.code === "en") {
      const sentenceStarter = /^(?:I|You|He|She|It|We|They|This|That|These|Those|The|A|An|But|And|So|Then|Next|Now|What|Why|How|When|Where|Who|Are|Is|Do|Did|Can|Will)\b/;
      if (/^[A-Za-z]/.test(after) && !sentenceStarter.test(after)) return false;
    } else if (/^\p{L}/u.test(after)) {
      // Without English's list of sentence starters, an initial before any
      // word ("J. Pérez") is taken as part of a name.
      return false;
    }
  }
  return true;
}

function protectedWordBreak(text, position, rules) {
  const previousWord = text.slice(0, position).trimEnd().match(/([\p{L}’'.]+)$/u)?.[1] || "";
  const nextWord = text.slice(position).trimStart().match(/^([\p{L}’']+)/u)?.[1] || "";
  if (rules.dependent?.test(previousWord)) return true;
  if (rules.nameTitles?.test(previousWord)) return true;
  // This is a conservative name heuristic, not a full grammar parser.
  return rules.names && /^[A-Z][a-z]+$/.test(previousWord) && /^[A-Z][a-z]+$/.test(nextWord);
}

/** Split every original cue into sentences before considering length limits. */
export function splitAtSentenceEnds(input, language = "en") {
  const rules = rulesFor(language);
  const text = input.replace(/\s+/g, " ").trim();
  const sentences = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isSentenceEnd(text, index, rules)) continue;
    let end = index + 1;
    // Repeated punctuation and closing quotes belong to the sentence just ended.
    while (
      end < text.length &&
      (SENTENCE_PUNCTUATION.test(text[end]) || CLOSING_PUNCTUATION.test(text[end]))
    ) {
      end += 1;
    }
    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    index = end - 1;
  }

  const remainder = text.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences;
}

/** A break position for text written without spaces: after punctuation, else near the target. */
function findUnspacedBreak(text, maxChars, rules) {
  const lowerBound = Math.max(2, Math.floor(maxChars * 0.52));
  const searchEnd = Math.min(text.length - 1, maxChars);
  let best = { position: 0, score: -Infinity };
  for (let position = lowerBound; position <= searchEnd; position += 1) {
    const char = text[position - 1];
    const next = text[position] || "";
    let priority = 1;
    if (isSentenceEnd(text, position - 1, rules)) priority = 5;
    else if (PAUSE_PUNCTUATION.test(char)) priority = 4;
    else if (CLAUSE_PUNCTUATION.test(char)) priority = 3;
    else if (char === " ") priority = 2;
    // Never start a line with closing punctuation or end one with an opening bracket.
    if (SENTENCE_PUNCTUATION.test(next) || CLOSING_PUNCTUATION.test(next) || CLAUSE_PUNCTUATION.test(next) ||
      PAUSE_PUNCTUATION.test(next) || /[「『（(“《【]/.test(char)) {
      priority = 0;
    }
    const score = priority * 10 - Math.abs(maxChars - position) / maxChars;
    if (priority && score > best.score) best = { position, score };
  }
  return best.position || Math.min(maxChars, text.length);
}

function findNaturalBreak(text, maxChars, rules = rulesFor("en")) {
  if (!rules.spaced) return findUnspacedBreak(text, maxChars, rules);
  const lowerBound = Math.max(12, Math.floor(maxChars * 0.52));
  const searchEnd = Math.min(text.length, maxChars);
  const candidates = [];

  for (let index = lowerBound; index < searchEnd; index += 1) {
    const char = text[index];
    const next = text.slice(index + 1);
    let priority = 0;
    if (isSentenceEnd(text, index, rules)) priority = 5;
    else if (PAUSE_PUNCTUATION.test(char)) priority = 4;
    else if (/[,，—–،]/.test(char)) priority = 3;
    else if (char === " " && rules.conjunctions?.test(next)) {
      priority = 2;
    } else if (char === " " && rules.articles?.test(next)) {
      // Keep an article with its noun phrase and prefer a bottom-heavy shape.
      priority = 2;
    } else if (char === " ") {
      priority = rules.prepositions?.test(next) ? 2 : 1;
    }
    if (char === " " && protectedWordBreak(text, index, rules)) priority = 0;

    if (priority) {
      const position = index + 1;
      const distance = Math.abs(maxChars - position) / maxChars;
      candidates.push({ position, score: priority * 10 - distance });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.position - a.position);
  if (candidates.length) return candidates[0].position;

  for (let index = searchEnd - 1; index > 0; index -= 1) {
    if (text[index] === " " && !protectedWordBreak(text, index, rules)) return index;
  }
  const before = text.lastIndexOf(" ", maxChars);
  if (before > 0) return before;

  // A single long token must stay intact even if it exceeds the line target.
  const after = text.indexOf(" ", maxChars);
  return after < 0 ? text.length : after;
}

export function splitAtNaturalBreaks(input, maxChars, language = "en") {
  const rules = rulesFor(language);
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const parts = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const position = findNaturalBreak(remaining, maxChars, rules);
    const part = remaining.slice(0, position).trim();
    if (!part) break;
    parts.push(part);
    remaining = remaining.slice(position).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

export function wrapAtNaturalBreaks(input, maxChars, language = "en") {
  return splitAtNaturalBreaks(input, maxChars, language).join("\n");
}

/** Wrap a spaced-language cue: one line when it fits, else two balanced lines. */
function wrapSpacedCue(input, maxChars, rules) {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  if (text.length > maxChars * 2) {
    return wrapAtNaturalBreaks(text, maxChars, rules.code);
  }

  const minimum = text.length - maxChars;
  const target = Math.floor(text.length / 2);
  const candidates = [];
  for (let index = minimum; index <= maxChars; index += 1) {
    const char = text[index];
    if (char !== " " && !/[,，;；:：—–،؛]/.test(char) && !isSentenceEnd(text, index, rules)) continue;

    const position = char === " " ? index : index + 1;
    if (position < minimum || position > maxChars) continue;
    const next = text.slice(index + 1);
    let priority = isSentenceEnd(text, index, rules)
      ? 5
      : /[,;:—–،؛]/.test(char)
        ? 3
        : rules.breakBefore?.test(next)
          ? 2
          : 1;
    if (char === " " && protectedWordBreak(text, index, rules)) priority -= 10;
    candidates.push({
      position,
      score: priority * 10 - Math.abs(target - position) / maxChars,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return wrapAtNaturalBreaks(text, maxChars, rules.code);
  const position = candidates[0].position;
  return `${text.slice(0, position).trim()}\n${text.slice(position).trim()}`;
}

const UNSPACED_BREAK = /[。！？…，；：、,;:!?]/;

/** Wrap text written without spaces into lines of at most `maxChars` characters. */
function wrapUnspaced(input, maxChars) {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const length = Array.from(text).length;
  if (length > maxChars && length <= maxChars * 2) {
    const characters = Array.from(text);
    const minimum = length - maxChars;
    const target = Math.floor(length / 2);
    const punctuationBreaks = characters
      .map((character, index) =>
        UNSPACED_BREAK.test(character) || character === " " ? index + 1 : -1,
      )
      .filter((position) => position >= minimum && position <= maxChars)
      .sort(
        (a, b) =>
          Math.abs(target - a) - Math.abs(target - b) ||
          Number(a > target) - Number(b > target),
      );
    const position = punctuationBreaks[0] || target;
    return `${characters.slice(0, position).join("").trim()}\n${characters
      .slice(position)
      .join("")
      .trim()}`;
  }
  const characters = Array.from(text);
  const lines = [];
  while (characters.length > maxChars) {
    let position = maxChars;
    for (let index = maxChars - 1; index >= Math.floor(maxChars / 2); index -= 1) {
      if (UNSPACED_BREAK.test(characters[index]) || characters[index] === " ") {
        position = index + 1;
        break;
      }
    }
    lines.push(characters.splice(0, position).join("").trim());
  }
  if (characters.length) lines.push(characters.join("").trim());
  return lines.join("\n");
}

/** Wrap one subtitle in `language` to lines of about `maxChars` characters. */
export function wrapSubtitle(input, maxChars, language = "en") {
  const rules = rulesFor(language);
  const width = maxChars || getLanguage(language).lineChars;
  return rules.spaced ? wrapSpacedCue(input, width, rules) : wrapUnspaced(input, width);
}

function locatePieces(text, pieces) {
  let cursor = 0;
  return pieces.map((piece) => {
    const start = text.indexOf(piece, cursor);
    const safeStart = start < 0 ? cursor : start;
    cursor = safeStart + piece.length;
    return { text: piece, startOffset: safeStart, endOffset: cursor };
  });
}

/**
 * A piece's identity is its source cue plus its text, independent of where
 * layout settings place it, so translations can follow unchanged text. The
 * occurrence count keeps repeats within one cue ("Yes. Yes.") independent.
 */
function pieceKeys(cue, pieces) {
  const seen = new Map();
  return pieces.map((piece) => {
    const occurrence = seen.get(piece) ?? 0;
    seen.set(piece, occurrence + 1);
    return `${cue.sourceId}|${occurrence}|${piece}`;
  });
}

function allocateTimings(cue, pieces, lineChars, language) {
  const located = locatePieces(cue.text, pieces);
  const keys = pieceKeys(cue, pieces);
  if (pieces.length === 1) {
    return [
      {
        ...cue,
        id: `${cue.id}-1`,
        key: keys[0],
        text: wrapSubtitle(pieces[0], lineChars, language),
        contextText: cue.text,
      },
    ];
  }

  const duration = cue.endMs - cue.startMs;
  if (duration < pieces.length) {
    throw new SubtitleError("cue-too-short", "A source cue is too short to split inside its own time range.");
  }
  let previousEndMs = cue.startMs;
  return pieces.map((piece, index) => {
    const startMs = previousEndMs;
    const endMs =
      index === pieces.length - 1
        ? cue.endMs
        : Math.min(
            cue.endMs - (pieces.length - index - 1),
            Math.max(
              startMs + 1,
              cue.startMs + Math.round(duration * located[index].endOffset / cue.text.length),
            ),
          );
    previousEndMs = endMs;
    return {
      ...cue,
      id: `${cue.id}-${index + 1}`,
      key: keys[index],
      startMs,
      endMs,
      text: wrapSubtitle(piece, lineChars, language),
      contextText: cue.text,
    };
  });
}

/**
 * Split each source cue at sentence ends and, in "new-cue" mode, long
 * sentences at natural breaks. Never merges cues. `maxChars` and `lineChars`
 * are in characters of the source `language`.
 */
export function tidyCues(cues, options = {}) {
  const language = getLanguage(options.language).code;
  const maxChars = Math.min(84, Math.max(16, Number(options.maxChars) || 72));
  const lineChars = Math.min(42, Math.max(8, Number(options.lineChars) || 42));
  const mode = options.mode === "line-break" ? "line-break" : "new-cue";
  return cues.flatMap((originalCue, index) => {
    const cue = { ...originalCue, text: originalCue.text.replace(/\s+/g, " ").trim() };
    // Lets translation see how a sentence continues from the previous cue.
    const previous = cues[index - 1]?.text.replace(/\s+/g, " ").trim();
    if (previous) cue.previousText = previous;
    const sentences = splitAtSentenceEnds(cue.text, language);
    const pieces = mode === "line-break"
      ? sentences
      : sentences.flatMap((sentence) =>
          splitAtNaturalBreaks(sentence, Math.min(maxChars, lineChars * 2), language));
    return allocateTimings(cue, pieces, lineChars, language);
  });
}

/** Characters a reader takes in: spaces count in spaced scripts, not in unspaced ones. */
export function textLength(text, language = "en") {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return Array.from(getLanguage(language).spaced ? normalized : normalized.replace(/\s/g, "")).length;
}

/** Wraps Chinese (or any unspaced text) to 16-character lines by default. */
export function wrapChineseSubtitle(input, maxChars = 16) {
  return wrapUnspaced(input, maxChars);
}

export function isReadableSubtitle(input, maxChars, language = "zh-Hans") {
  return textLength(input, language) <= maxChars;
}

export function isReadableChineseSubtitle(input, maxChars = 32) {
  return isReadableSubtitle(input, maxChars, "zh-Hans");
}

/**
 * Advisory checks from Netflix's general and language guides, returned as
 * `{ code, limit? }` so the interface can word them in the reader's language:
 * "too-short", "too-long", "source-lines", "source-width", "source-speed",
 * "target-lines", "target-speed".
 */
export function getSubtitleWarnings(cue, translation = "", options = {}) {
  const warnings = [];
  const sourceLanguage = getLanguage(options.sourceLanguage);
  const targetLanguage = getLanguage(options.targetLanguage || "zh-Hans");
  const seconds = (cue.endMs - cue.startMs) / 1_000;
  if (seconds < 5 / 6) warnings.push({ code: "too-short", limit: 0.83 });
  if (seconds > 7) warnings.push({ code: "too-long", limit: 7 });
  const source = cue.text.replace(/<[^>]*>/g, "");
  const lines = source.split("\n");
  if (lines.length > 2) warnings.push({ code: "source-lines", limit: 2 });
  const sourceLineChars = options.sourceLineChars || sourceLanguage.lineChars;
  const targetLineChars = options.targetLineChars || targetLanguage.lineChars;
  const maxSourceCps = options.maxSourceCps || sourceLanguage.cps;
  const maxTargetCps = options.maxTargetCps || targetLanguage.cps;
  if (lines.some((line) => Array.from(line).length > sourceLineChars)) {
    warnings.push({ code: "source-width", limit: sourceLineChars });
  }
  if (textLength(source, sourceLanguage.code) > seconds * maxSourceCps) {
    warnings.push({ code: "source-speed", limit: maxSourceCps });
  }
  if (translation.trim()) {
    if (wrapSubtitle(translation, targetLineChars, targetLanguage.code).split("\n").length > 2) {
      warnings.push({ code: "target-lines", limit: 2 });
    }
    if (textLength(translation, targetLanguage.code) > seconds * maxTargetCps) {
      warnings.push({ code: "target-speed", limit: maxTargetCps });
    }
  }
  return warnings;
}

export function formatTimestamp(ms) {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const milliseconds = safe % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(
    3,
    "0",
  )}`;
}

/**
 * Serialize cues as SRT. `content` is "bilingual" (default), "source" or
 * "translation"; `order` puts the translation ("translation-first", default)
 * or the source ("source-first") on top. The older `bilingual: false` and
 * "chinese-first"/"english-first" values are still understood.
 */
export function serializeSrt(cues, translations = {}, options = {}) {
  const order =
    options.order === "source-first" || options.order === "english-first"
      ? "source-first"
      : "translation-first";
  const content = options.content ?? (options.bilingual === false ? "source" : "bilingual");
  const includeBom = options.includeBom !== false;
  const lineEnding = options.lineEnding === "\r\n" ? "\r\n" : "\n";
  const timeOffsetMs = Math.round(Number(options.timeOffsetMs) || 0);
  const targetLanguage = options.targetLanguage || "zh-Hans";
  const targetLineChars = options.targetLineChars || getLanguage(targetLanguage).lineChars;
  if (cues.some((cue) => cue.startMs + timeOffsetMs < 0)) {
    throw new SubtitleError("negative-time", "The time offset moves a cue before zero.");
  }

  const body = cues
    .map((cue, index) => {
      const source = cue.text.trim();
      const translation = String(translations[cue.id] || "").trim();
      const formatted = wrapSubtitle(translation, targetLineChars, targetLanguage);
      let lines = [source];
      if (translation && content === "translation") lines = [formatted];
      else if (translation && content === "bilingual") {
        lines = order === "source-first" ? [source, formatted] : [formatted, source];
      }

      return `${index + 1}\n${formatTimestamp(cue.startMs + timeOffsetMs)} --> ${formatTimestamp(
        cue.endMs + timeOffsetMs,
      )}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  return `${includeBom ? "﻿" : ""}${body}\n`.replace(/\r?\n/g, lineEnding);
}

export function subtitleDuration(cues) {
  if (!cues.length) return 0;
  return Math.max(...cues.map((cue) => cue.endMs));
}
