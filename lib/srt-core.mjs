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

function endsCompleteThought(text) {
  return /[.!?…]["'’”)\]]*$/.test(text.trim());
}

function startsNewSpeaker(text) {
  return /^(?:[-–—]\s+|[A-Z][A-Z .'-]{1,24}:\s*)/.test(text.trim());
}

function asTimedGroup(cue, groupIndex) {
  return {
    ...cue,
    id: `group-${groupIndex + 1}`,
    sourceIds: [cue.sourceId],
    timingSegments: [
      {
        startOffset: 0,
        endOffset: cue.text.length,
        startMs: cue.startMs,
        endMs: cue.endMs,
      },
    ],
  };
}

/**
 * Buzz often exports one spoken sentence as several short time blocks.
 * Rejoin adjacent fragments before doing any length-based splitting so that
 * translation receives complete thoughts instead of disconnected clauses.
 */
export function mergeFragmentedCues(cues, options = {}) {
  const maxGapMs = Math.max(0, Number(options.maxGapMs) || 1_200);
  const hardLimit = Math.max(240, Number(options.hardLimit) || 360);
  const groups = [];
  let current = null;

  for (const cue of cues) {
    if (!current) {
      current = asTimedGroup(cue, groups.length);
      continue;
    }

    const gap = cue.startMs - current.endMs;
    const combinedText = `${current.text} ${cue.text}`.replace(/\s+/g, " ").trim();
    const shouldMerge =
      !endsCompleteThought(current.text) &&
      !startsNewSpeaker(cue.text) &&
      gap >= -100 &&
      gap <= maxGapMs &&
      combinedText.length <= hardLimit;

    if (shouldMerge) {
      const startOffset = current.text.length + 1;
      current = {
        ...current,
        endMs: cue.endMs,
        text: combinedText,
        sourceIds: [...current.sourceIds, cue.sourceId],
        timingSegments: [
          ...current.timingSegments,
          {
            startOffset,
            endOffset: startOffset + cue.text.length,
            startMs: cue.startMs,
            endMs: cue.endMs,
          },
        ],
      };
    } else {
      groups.push(current);
      current = asTimedGroup(cue, groups.length);
    }
  }

  if (current) groups.push(current);
  return groups;
}

function findNaturalBreak(text, maxChars) {
  const lowerBound = Math.max(12, Math.floor(maxChars * 0.52));
  const searchEnd = Math.min(text.length, maxChars);
  const candidates = [];

  for (let index = lowerBound; index < searchEnd; index += 1) {
    const char = text[index];
    const next = text.slice(index + 1);
    let priority = 0;
    if (/[.!?…]/.test(char)) priority = 5;
    else if (/[;:；：]/.test(char)) priority = 4;
    else if (/[,，—–]/.test(char)) priority = 3;
    else if (char === " " && /^(?:and|but|or|so|because|while|when|if|which|who|that|as)\b/i.test(next)) {
      priority = 2;
    } else if (char === " " && /^(?:a|an|the)\b/i.test(next)) {
      // Keep an article with its noun phrase and prefer a bottom-heavy shape.
      priority = 2;
    } else if (char === " ") {
      const previousWord = text.slice(0, index).match(/([A-Za-z']+)$/)?.[1] || "";
      const nextWord = next.match(/^([A-Za-z']+)/)?.[1] || "";
      const weakEdge = /^(?:a|an|the|to|of|in|for|with|at|by|from|into|on)$/i;
      // Do not strand short function words on either side of a break.
      priority = weakEdge.test(previousWord) || weakEdge.test(nextWord) ? 0 : 1;
    }

    if (priority) {
      const position = index + 1;
      const distance = Math.abs(maxChars - position) / maxChars;
      candidates.push({ position, score: priority * 10 - distance });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.position - a.position);
  if (candidates.length) return candidates[0].position;

  const before = text.lastIndexOf(" ", maxChars);
  if (before >= lowerBound) return before;

  return Math.min(maxChars, text.length);
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
    if (char !== " " && !/[.!?,;:…—–]/.test(char)) continue;

    const position = char === " " ? index : index + 1;
    if (position < minimum || position > maxChars) continue;
    const previousWord = text.slice(0, index).match(/([A-Za-z']+)$/)?.[1] || "";
    const nextWord = text.slice(index + 1).match(/^([A-Za-z']+)/)?.[1] || "";
    const weakEdge = /^(?:a|an|the|to|of|in|for|with|at|by|from|into|on)$/i;
    let priority = /[.!?…]/.test(char)
      ? 5
      : /[,;:—–]/.test(char)
        ? 3
        : /^(?:and|but|or|so|because|while|when|if|which|who|that|as|a|an|the)$/i.test(
              nextWord,
            )
          ? 2
          : 1;
    if (weakEdge.test(previousWord) || weakEdge.test(nextWord)) priority -= 2;
    candidates.push({
      position,
      score: priority * 10 - Math.abs(target - position) / maxChars,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const position = candidates[0]?.position || target;
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

function timeAtOffset(cue, offset) {
  const segments = cue.timingSegments || [];
  if (!segments.length || offset <= 0) return cue.startMs;
  if (offset >= cue.text.length) return cue.endMs;

  const segment =
    segments.find(
      (candidate) =>
        offset >= candidate.startOffset && offset <= candidate.endOffset,
    ) || segments.find((candidate) => offset < candidate.startOffset);
  if (!segment) return cue.endMs;
  if (offset <= segment.startOffset) return segment.startMs;

  const span = Math.max(1, segment.endOffset - segment.startOffset);
  const progress = (offset - segment.startOffset) / span;
  return Math.round(
    segment.startMs + (segment.endMs - segment.startMs) * progress,
  );
}

function allocateTimings(cue, pieces, lineChars) {
  const located = locatePieces(cue.text, pieces);
  if (pieces.length === 1) {
    return [
      {
        ...cue,
        id: `${cue.id}-1`,
        text: wrapEnglishCue(pieces[0], lineChars),
        contextText: cue.text,
      },
    ];
  }

  return pieces.map((piece, index) => {
    const startMs =
      index === 0 ? cue.startMs : timeAtOffset(cue, located[index].startOffset);
    const endMs =
      index === pieces.length - 1
        ? cue.endMs
        : timeAtOffset(cue, located[index].endOffset);
    return {
      ...cue,
      id: `${cue.id}-${index + 1}`,
      startMs,
      endMs: Math.max(startMs + 1, endMs),
      text: wrapEnglishCue(piece, lineChars),
      contextText: cue.text,
    };
  });
}

export function tidyCues(cues, options = {}) {
  const maxChars = Math.min(84, Math.max(42, Number(options.maxChars) || 72));
  const lineChars = Math.min(42, Math.max(24, Number(options.lineChars) || 42));
  const mode = options.mode === "line-break" ? "line-break" : "new-cue";
  const semanticCues = mergeFragmentedCues(cues, options);

  if (mode === "line-break") {
    return semanticCues.map((cue) => ({
      ...cue,
      id: `${cue.id}-1`,
      contextText: cue.text,
      text: wrapEnglishCue(cue.text, lineChars),
    }));
  }

  return semanticCues.flatMap((cue) => {
    const pieces = splitAtNaturalBreaks(cue.text, maxChars);
    return allocateTimings(cue, pieces, lineChars);
  });
}

function visibleLength(text) {
  return Array.from(text.replace(/\s/g, "")).length;
}

export function wrapChineseSubtitle(input, maxChars = 16) {
  const text = input.replace(/\s+/g, "").trim();
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
  return splitAtNaturalBreaks(text, maxChars).join("\n");
}

export function isReadableChineseSubtitle(input, maxChars = 32) {
  return visibleLength(input) <= maxChars;
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

  const body = cues
    .map((cue, index) => {
      const english = cue.text.trim();
      const chinese = String(translations[cue.id] || "").trim();
      const formattedChinese = wrapChineseSubtitle(chinese);
      const lines =
        bilingual && chinese
          ? order === "english-first"
            ? [english, formattedChinese]
            : [formattedChinese, english]
          : [english];

      return `${index + 1}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(
        cue.endMs,
      )}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  return `${includeBom ? "\uFEFF" : ""}${body}\n`;
}

export function subtitleDuration(cues) {
  if (!cues.length) return 0;
  return Math.max(...cues.map((cue) => cue.endMs));
}
