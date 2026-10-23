/**
 * Dependency-free SRT helpers shared by the browser and the test suite.
 */

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

  if (!normalized) throw new Error("字幕文件是空的。");

  const cues = [];
  const blocks = normalized.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line));
    if (timingIndex < 0) continue;

    const match = lines[timingIndex].match(TIMING_LINE);
    if (!match) continue;

    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    const startMs = timestampToMs(match, 1);
    const endMs = timestampToMs(match, 5);
    if (endMs <= startMs) continue;

    cues.push({
      id: `cue-${cues.length + 1}`,
      sourceId: `source-${cues.length + 1}`,
      startMs,
      endMs,
      text,
    });
  }

  if (!cues.length) {
    throw new Error("没有识别到有效的 SRT 时间轴，请确认文件格式是否正确。");
  }

  return cues;
}

const SENTENCE_PUNCTUATION = /[.!?。．｡！？…⋯]/;
const CLOSING_PUNCTUATION = /["'’”»）)\]】」』]/;

function isSentenceEnd(text, index) {
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
      (!continuation || /^[A-Z.!?。．｡！？]/.test(continuation));
  }
  if (character !== ".") return true;

  // A decimal point, title, or initial is not the end of a spoken sentence.
  if (/\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "")) {
    return false;
  }
  const before = text.slice(0, index + 1);
  const after = text.slice(index + 1).trimStart();
  if (!after) return true;
  if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|Gen|Lt|Col|Capt|Sgt|St|vs|cf|Fig|No)\.$/i.test(before)) {
    return false;
  }

  const initials = before.match(/(?:^|[\s("'“‘])((?:[A-Za-z]\.)+)$/)?.[1];
  if (initials) {
    // Keep U.S., U.K., e.g., i.e., and names such as J. R. Smith intact.
    if (/^[A-Za-z]\./.test(text.slice(index + 1))) return false;
    if (/^(?:e\.g\.|i\.e\.)$/i.test(initials)) return false;
    const sentenceStarter = /^(?:I|You|He|She|It|We|They|This|That|These|Those|The|A|An|But|And|So|Then|Next|Now|What|Why|How|When|Where|Who|Are|Is|Do|Did|Can|Will)\b/;
    if (/^[A-Za-z]/.test(after) && !sentenceStarter.test(after)) return false;
  }
  return true;
}

function protectedWordBreak(text, position) {
  const previousWord = text.slice(0, position).trimEnd().match(/([A-Za-z’'.]+)$/)?.[1] || "";
  const nextWord = text.slice(position).trimStart().match(/^([A-Za-z’']+)/)?.[1] || "";
  const dependentWord = /^(?:a|an|the|my|your|his|her|its|our|their|to|of|in|for|with|at|by|from|into|on|under|over|about|and|but|or|because|if|while|when|I|you|he|she|it|we|they|am|is|are|was|were|be|been|being|have|has|had|do|does|did|can|could|will|would|shall|should|may|might|must|not|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|can't)$/i;
  if (dependentWord.test(previousWord)) return true;
  if (/^(?:Mr|Mrs|Ms|Dr|Prof|Rev|Gen|Lt|Col|Capt|Sgt|St)\.$/i.test(previousWord)) return true;
  // This is a conservative name heuristic, not a full grammar parser.
  return /^[A-Z][a-z]+$/.test(previousWord) && /^[A-Z][a-z]+$/.test(nextWord);
}

/** Split every original cue into sentences before considering length limits. */
export function splitAtSentenceEnds(input) {
  const text = input.replace(/\s+/g, " ").trim();
  const sentences = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isSentenceEnd(text, index)) continue;
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

function findNaturalBreak(text, maxChars) {
  const lowerBound = Math.max(12, Math.floor(maxChars * 0.52));
  const searchEnd = Math.min(text.length, maxChars);
  const candidates = [];

  for (let index = lowerBound; index < searchEnd; index += 1) {
    const char = text[index];
    const next = text.slice(index + 1);
    let priority = 0;
    if (isSentenceEnd(text, index)) priority = 5;
    else if (/[;:；：]/.test(char)) priority = 4;
    else if (/[,，—–]/.test(char)) priority = 3;
    else if (char === " " && /^(?:and|but|or|so|because|while|when|if|which|who|that|as)\b/i.test(next)) {
      priority = 2;
    } else if (char === " " && /^(?:a|an|the)\b/i.test(next)) {
      // Keep an article with its noun phrase and prefer a bottom-heavy shape.
      priority = 2;
    } else if (char === " ") {
      priority = /^(?:to|of|in|for|with|at|by|from|into|on|under|over|about)\b/i.test(next) ? 2 : 1;
    }
    if (char === " " && protectedWordBreak(text, index)) priority = 0;

    if (priority) {
      const position = index + 1;
      const distance = Math.abs(maxChars - position) / maxChars;
      candidates.push({ position, score: priority * 10 - distance });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.position - a.position);
  if (candidates.length) return candidates[0].position;

  for (let index = searchEnd - 1; index > 0; index -= 1) {
    if (text[index] === " " && !protectedWordBreak(text, index)) return index;
  }
  const before = text.lastIndexOf(" ", maxChars);
  if (before > 0) return before;

  // A single long token must stay intact even if it exceeds the line target.
  const after = text.indexOf(" ", maxChars);
  return after < 0 ? text.length : after;
}

export function splitAtNaturalBreaks(input, maxChars) {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const parts = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const position = findNaturalBreak(remaining, maxChars);
    const part = remaining.slice(0, position).trim();
    if (!part) break;
    parts.push(part);
    remaining = remaining.slice(position).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

export function wrapAtNaturalBreaks(input, maxChars) {
  return splitAtNaturalBreaks(input, maxChars).join("\n");
}

function wrapEnglishCue(input, maxChars) {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  if (text.length > maxChars * 2) {
    return wrapAtNaturalBreaks(text, maxChars);
  }

  const minimum = text.length - maxChars;
  const target = Math.floor(text.length / 2);
  const candidates = [];
  for (let index = minimum; index <= maxChars; index += 1) {
    const char = text[index];
    if (char !== " " && !/[,，;；:：—–]/.test(char) && !isSentenceEnd(text, index)) continue;

    const position = char === " " ? index : index + 1;
    if (position < minimum || position > maxChars) continue;
    const nextWord = text.slice(index + 1).match(/^([A-Za-z']+)/)?.[1] || "";
    let priority = isSentenceEnd(text, index)
      ? 5
      : /[,;:—–]/.test(char)
        ? 3
        : /^(?:and|but|or|so|because|while|when|if|which|who|that|as|a|an|the)$/i.test(
              nextWord,
            )
          ? 2
          : 1;
    if (char === " " && protectedWordBreak(text, index)) priority -= 10;
    candidates.push({
      position,
      score: priority * 10 - Math.abs(target - position) / maxChars,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return wrapAtNaturalBreaks(text, maxChars);
  const position = candidates[0].position;
  return `${text.slice(0, position).trim()}\n${text.slice(position).trim()}`;
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

function allocateTimings(cue, pieces, lineChars) {
  const located = locatePieces(cue.text, pieces);
  const keys = pieceKeys(cue, pieces);
  if (pieces.length === 1) {
    return [
      {
        ...cue,
        id: `${cue.id}-1`,
        key: keys[0],
        text: wrapEnglishCue(pieces[0], lineChars),
        contextText: cue.text,
      },
    ];
  }

  const duration = cue.endMs - cue.startMs;
  if (duration < pieces.length) {
    throw new Error("原字幕时长过短，无法在原时间范围内分隔句子，请检查 SRT 时间轴。");
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
      text: wrapEnglishCue(piece, lineChars),
      contextText: cue.text,
    };
  });
}

export function tidyCues(cues, options = {}) {
  const maxChars = Math.min(84, Math.max(42, Number(options.maxChars) || 72));
  const lineChars = Math.min(42, Math.max(24, Number(options.lineChars) || 42));
  const mode = options.mode === "line-break" ? "line-break" : "new-cue";
  return cues.flatMap((originalCue) => {
    const cue = { ...originalCue, text: originalCue.text.replace(/\s+/g, " ").trim() };
    const sentences = splitAtSentenceEnds(cue.text);
    const pieces = mode === "line-break"
      ? sentences
      : sentences.flatMap((sentence) => splitAtNaturalBreaks(sentence, Math.min(maxChars, lineChars * 2)));
    return allocateTimings(cue, pieces, lineChars);
  });
}

function visibleLength(text) {
  return Array.from(text.replace(/\s/g, "")).length;
}

export function wrapChineseSubtitle(input, maxChars = 16) {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const length = Array.from(text).length;
  if (length > maxChars && length <= maxChars * 2) {
    const characters = Array.from(text);
    const minimum = length - maxChars;
    const target = Math.floor(length / 2);
    const punctuationBreaks = characters
      .map((character, index) =>
        /[。！？…，；：、]/.test(character) ? index + 1 : -1,
      )
      .filter((position) => position >= minimum && position <= maxChars)
      .sort(
        (a, b) =>
          Math.abs(target - a) - Math.abs(target - b) ||
          Number(a > target) - Number(b > target),
      );
    const position = punctuationBreaks[0] || target;
    return `${characters.slice(0, position).join("")}\n${characters
      .slice(position)
      .join("")}`;
  }
  const characters = Array.from(text);
  const lines = [];
  while (characters.length > maxChars) {
    let position = maxChars;
    for (let index = maxChars - 1; index >= Math.floor(maxChars / 2); index -= 1) {
      if (/[。！？…，；：、]/.test(characters[index])) {
        position = index + 1;
        break;
      }
    }
    lines.push(characters.splice(0, position).join("").trim());
  }
  if (characters.length) lines.push(characters.join("").trim());
  return lines.join("\n");
}

export function isReadableChineseSubtitle(input, maxChars = 32) {
  return visibleLength(input) <= maxChars;
}

/** Advisory targets from Netflix's adult English/Chinese and general guides. */
export function getSubtitleWarnings(cue, translation = "", options = {}) {
  const warnings = [];
  const seconds = (cue.endMs - cue.startMs) / 1_000;
  if (seconds < 5 / 6) warnings.push("显示不足 0.83 秒");
  if (seconds > 7) warnings.push("显示超过 7 秒");
  const english = cue.text.replace(/<[^>]*>/g, "");
  const lines = english.split("\n");
  if (lines.length > 2) warnings.push("英文超过两行");
  const englishLineChars = options.englishLineChars || 42;
  const chineseLineChars = options.chineseLineChars || 16;
  const maxEnglishCps = options.maxEnglishCps || 20;
  const maxChineseCps = options.maxChineseCps || 9;
  if (lines.some((line) => Array.from(line).length > englishLineChars)) warnings.push(`英文单行超过 ${englishLineChars} 字符`);
  if (Array.from(english.replace(/\s+/g, " ").trim()).length > seconds * maxEnglishCps) {
    warnings.push(`英文阅读速度超过 ${maxEnglishCps} 字符/秒`);
  }
  if (translation.trim()) {
    if (wrapChineseSubtitle(translation, chineseLineChars).split("\n").length > 2) warnings.push("中文超过两行");
    if (visibleLength(translation) > seconds * maxChineseCps) warnings.push(`中文阅读速度超过 ${maxChineseCps} 字符/秒`);
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

export function serializeSrt(cues, translations = {}, options = {}) {
  const order =
    options.order === "english-first" ? "english-first" : "chinese-first";
  const includeBom = options.includeBom !== false;
  const bilingual = options.bilingual !== false;
  const lineEnding = options.lineEnding === "\r\n" ? "\r\n" : "\n";
  const timeOffsetMs = Math.round(Number(options.timeOffsetMs) || 0);
  if (cues.some((cue) => cue.startMs + timeOffsetMs < 0)) {
    throw new Error("时间偏移后出现负时间，请调整整体时间偏移。");
  }

  const body = cues
    .map((cue, index) => {
      const english = cue.text.trim();
      const chinese = String(translations[cue.id] || "").trim();
      const formattedChinese = wrapChineseSubtitle(chinese, options.chineseLineChars || 16);
      const lines =
        bilingual && chinese
          ? order === "english-first"
            ? [english, formattedChinese]
            : [formattedChinese, english]
          : [english];

      return `${index + 1}\n${formatTimestamp(cue.startMs + timeOffsetMs)} --> ${formatTimestamp(
        cue.endMs + timeOffsetMs,
      )}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  return `${includeBom ? "\uFEFF" : ""}${body}\n`.replace(/\r?\n/g, lineEnding);
}

export function subtitleDuration(cues) {
  if (!cues.length) return 0;
  return Math.max(...cues.map((cue) => cue.endMs));
}
