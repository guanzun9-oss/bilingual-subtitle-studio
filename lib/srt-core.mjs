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
      current = {
        ...cue,
        id: `group-${groups.length + 1}`,
        sourceIds: [cue.sourceId],
      };
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
      current = {
        ...current,
        endMs: cue.endMs,
        text: combinedText,
        sourceIds: [...current.sourceIds, cue.sourceId],
      };
    } else {
      groups.push(current);
      current = {
        ...cue,
        id: `group-${groups.length + 1}`,
        sourceIds: [cue.sourceId],
      };
    }
  }

  if (current) groups.push(current);
  return groups;
}

function findNaturalBreak(text, maxChars) {
  const lowerBound = Math.max(20, Math.floor(maxChars * 0.55));
  const searchEnd = Math.min(text.length, Math.floor(maxChars * 1.12));
  const strong = [];
  const soft = [];

  for (let index = 0; index < searchEnd; index += 1) {
    const char = text[index];
    if (/[.!?…]/.test(char)) strong.push(index + 1);
    if (/[,;:，；：—–]/.test(char)) soft.push(index + 1);
  }

  const goodStrong = strong.filter(
    (position) => position >= lowerBound && position <= searchEnd,
  );
  if (goodStrong.length) return goodStrong[goodStrong.length - 1];

  const goodSoft = soft.filter(
    (position) => position >= lowerBound && position <= maxChars,
  );
  if (goodSoft.length) return goodSoft[goodSoft.length - 1];

  const before = text.lastIndexOf(" ", maxChars);
  if (before >= lowerBound) return before;

  const after = text.indexOf(" ", maxChars);
  if (after > 0 && after <= searchEnd) return after;

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

function allocateTimings(cue, pieces) {
  if (pieces.length === 1) {
    return [
      {
        ...cue,
        id: `${cue.id}-1`,
        text: pieces[0],
        contextText: cue.text,
      },
    ];
  }

  const duration = cue.endMs - cue.startMs;
  const weights = pieces.map((piece) =>
    Math.max(1, piece.replace(/\s/g, "").length),
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let elapsedWeight = 0;

  return pieces.map((piece, index) => {
    const startMs =
      index === 0
        ? cue.startMs
        : cue.startMs + Math.round((duration * elapsedWeight) / totalWeight);
    elapsedWeight += weights[index];
    const endMs =
      index === pieces.length - 1
        ? cue.endMs
        : cue.startMs + Math.round((duration * elapsedWeight) / totalWeight);

    return {
      ...cue,
      id: `${cue.id}-${index + 1}`,
      startMs,
      endMs: Math.max(startMs + 1, endMs),
      text: piece,
      contextText: cue.text,
    };
  });
}

export function tidyCues(cues, options = {}) {
  const maxChars = Math.min(200, Math.max(48, Number(options.maxChars) || 112));
  const mode = options.mode === "line-break" ? "line-break" : "new-cue";
  const semanticCues = mergeFragmentedCues(cues, options);

  if (mode === "line-break") {
    return semanticCues.map((cue) => ({
      ...cue,
      id: `${cue.id}-1`,
      contextText: cue.text,
      text: wrapAtNaturalBreaks(cue.text, maxChars),
    }));
  }

  return semanticCues.flatMap((cue) => {
    const pieces = splitAtNaturalBreaks(cue.text, maxChars);
    return allocateTimings(cue, pieces);
  });
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
      const lines =
        bilingual && chinese
          ? order === "english-first"
            ? [english, chinese]
            : [chinese, english]
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
