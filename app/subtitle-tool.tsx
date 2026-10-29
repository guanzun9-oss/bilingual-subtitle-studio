"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatTimestamp,
  getSubtitleWarnings,
  isReadableChineseSubtitle,
  parseSrt,
  serializeSrt,
  subtitleDuration,
  tidyCues,
  wrapChineseSubtitle,
} from "@/lib/srt-core.mjs";
import LogoMark from "./logo-mark";
import { parseGlossary } from "@/lib/glossary.mjs";
import { EDITOR_PROFILES, exportFileName, getSubtitleProfile } from "@/lib/subtitle-profiles.mjs";
import {
  fingerprint,
  listSessions,
  loadApiKey,
  loadPrefs,
  loadSession,
  removeSession,
  saveApiKey,
  savePrefs,
  saveSession,
} from "@/lib/session-store.mjs";
import { translateInBatches } from "@/lib/translation-queue.mjs";

type Cue = {
  id: string;
  /** Identifies the source cue and text, so a translation survives re-splitting. */
  key: string;
  sourceId: string;
  startMs: number;
  endMs: number;
  text: string;
  contextText?: string;
  previousText?: string;
};

type Mode = "new-cue" | "line-break";
type Order = "chinese-first" | "english-first";

type SavedSession = {
  id: string;
  name: string;
  savedAt: number;
  translated: number;
  hasSource: boolean;
};

const MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];

/** localStorage, or undefined where the browser blocks it (e.g. some private modes). */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function formatSavedAt(savedAt: number) {
  return new Date(savedAt).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:08,600
When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.

2
00:00:09,100 --> 00:00:14,800
That changed everything. What should we do next? Let's find out!`;

// Sample translations so the demo shows the whole flow without an API key.
const DEMO_TRANSLATIONS: Record<string, string> = {
  "When we started this project, we thought": "我们刚开始做这个项目时，以为",
  "the hardest part would be the technology,": "最难的会是技术，",
  "but it turned out to be understanding what people truly needed.": "结果最难的是理解大家真正需要什么。",
  "When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.": "我们刚开始做这个项目时，以为最难的会是技术，结果最难的是理解大家真正需要什么。",
  "That changed everything.": "这改变了一切。",
  "What should we do next?": "接下来该做什么？",
  "Let's find out!": "一起来看看吧！",
};

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function maxChineseChars(cue: Cue, lineChars = 16) {
  return Math.max(
    8,
    Math.min(lineChars * 2, Math.floor(((cue.endMs - cue.startMs) / 1000) * 9)),
  );
}

type CueState = "done" | "pending" | "warn";
type Filter = "all" | "pending" | "warn";

const STATE_CODE: Record<CueState, string> = { done: "d", pending: "p", warn: "w" };

const EDITOR_SHORT_LABELS: Record<string, string> = {
  resolve: "达芬奇",
  premiere: "Premiere",
  generic: "通用 SRT",
};

function formatClock(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

// Quality checks wrap and measure the Chinese text. Re-running them for every
// cue on each keystroke made editing long files slow, so reuse the result
// until the cue, its translation, or the layout profile changes.
const warningCache = new WeakMap<Cue, { translation: string; profile: object; text: string }>();

function cueWarningText(cue: Cue, translation: string, profile: ReturnType<typeof getSubtitleProfile>) {
  const cached = warningCache.get(cue);
  if (cached && cached.translation === translation && cached.profile === profile) return cached.text;
  const text = getSubtitleWarnings(cue, translation, profile).join(" · ");
  warningCache.set(cue, { translation, profile, text });
  return text;
}

type SubtitleRowProps = {
  cue: Cue;
  index: number;
  translation: string;
  /** Joined so unchanged rows compare equal and skip re-rendering. */
  warnings: string;
  active: boolean;
  order: Order;
  timeOffsetMs: number;
  chineseLineChars: number;
  placeholder: string;
  onEdit: (key: string, value: string) => void;
  onSelect: (index: number) => void;
  onNavigate: (index: number, step: 1 | -1) => void;
};

// Scroll only the cue list on desktop: scrollIntoView would also move the page
// and push the bench header out of view. On phones the list flows with the page.
function revealRow(row: HTMLElement, block: "center" | "nearest", frames = 3) {
  if (!row.isConnected) return;
  const list = row.closest<HTMLElement>(".bench-body");
  if (!list || list.scrollHeight <= list.clientHeight) {
    // Not followed: the page scrolls smoothly and calling again would cut it short.
    row.scrollIntoView({ block });
    return;
  }
  const pinned = parseFloat(getComputedStyle(list).scrollPaddingTop) || 0;
  const view = list.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  const top = box.top - view.top + list.scrollTop;
  if (block === "center") list.scrollTop = top - pinned - (list.clientHeight - pinned - box.height) / 2;
  else if (box.top < view.top + pinned) list.scrollTop = top - pinned;
  else if (box.bottom > view.bottom) list.scrollTop = top + box.height - list.clientHeight;
  // Rows off screen have estimated heights (content-visibility) until they
  // render, so the target moves once its neighbours appear; follow it briefly.
  if (frames > 0) requestAnimationFrame(() => revealRow(row, block, frames - 1));
}

// Long films produce thousands of rows; typing in one must not re-render the rest.
const SubtitleRow = memo(function SubtitleRow({
  cue,
  index,
  translation,
  warnings,
  active,
  order,
  timeOffsetMs,
  chineseLineChars,
  placeholder,
  onEdit,
  onSelect,
  onNavigate,
}: SubtitleRowProps) {
  const state: CueState = warnings ? "warn" : translation.trim() ? "done" : "pending";
  return (
    <article id={`cue-row-${index}`} data-cue-index={index} className={`cue-row ${state} ${active ? "active" : ""}`}>
      <button className="cue-index" type="button" aria-label={`预览第 ${index + 1} 条字幕`} aria-pressed={active} onClick={() => onSelect(index)}>
        {String(index + 1).padStart(3, "0")}
      </button>
      <div className="cue-time">
        <time>{formatTimestamp(cue.startMs + timeOffsetMs)}</time>
        <time>{formatTimestamp(cue.endMs + timeOffsetMs)}</time>
        <span>{((cue.endMs - cue.startMs) / 1000).toFixed(2)}s</span>
      </div>
      <div className={`cue-copy ${order}`}>
        <textarea
          aria-label={`第 ${index + 1} 条中文字幕`}
          value={translation}
          onChange={(event) => onEdit(cue.key, event.target.value)}
          onFocus={() => onSelect(index)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              onNavigate(index, event.key === "ArrowDown" ? 1 : -1);
            }
          }}
          placeholder={placeholder}
          rows={Math.max(1, wrapChineseSubtitle(translation, chineseLineChars).split("\n").length)}
        />
        <p lang="en">{cue.text}</p>
      </div>
      <span className="cue-state" aria-hidden="true" />
      {warnings && <p className="cue-warning">需检查 · {warnings}</p>}
    </article>
  );
});

type SignalTrackProps = {
  cues: Cue[];
  /** One letter per cue (see STATE_CODE), so the track only redraws when a state changes. */
  stateCodes: string;
  activeIndex: number;
  onSelect: (index: number) => void;
};

/** The whole subtitle track at a glance: every cue drawn at its time, coloured by state. */
const SignalTrack = memo(function SignalTrack({ cues, stateCodes, activeIndex, onSelect }: SignalTrackProps) {
  const duration = useMemo(() => cues.reduce((max, cue) => Math.max(max, cue.endMs), 0), [cues]);
  const paths = useMemo(() => {
    const d: Record<string, string> = { d: "", p: "", w: "" };
    if (!duration) return d;
    cues.forEach((cue, index) => {
      const x = (cue.startMs / duration) * 1000;
      const width = Math.max(0.9, ((cue.endMs - cue.startMs) / duration) * 1000 - 0.35);
      d[stateCodes[index] || "p"] += `M${x.toFixed(2)} 0h${width.toFixed(2)}v40h${(-width).toFixed(2)}z`;
    });
    return d;
  }, [cues, stateCodes, duration]);
  if (!duration) return null;
  const active = cues[activeIndex];
  const marker = active ? (active.startMs / duration) * 100 : 0;

  return (
    <div className="signal-track">
      <div
        className="track-plot"
        role="img"
        aria-label={`字幕轨道：共 ${cues.length} 条，时长 ${formatClock(duration)}`}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ms = ((event.clientX - box.left) / box.width) * duration;
          let low = 0;
          let high = cues.length - 1;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (cues[middle].startMs <= ms) low = middle;
            else high = middle - 1;
          }
          onSelect(low);
        }}
      >
        <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
          <path className="track-pending" d={paths.p} />
          <path className="track-done" d={paths.d} />
          <path className="track-warn" d={paths.w} />
        </svg>
        {active && <i className="track-marker" style={{ left: `${marker}%` }} />}
      </div>
      <div className="track-ticks" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((point) => <span key={point}>{formatClock(duration * point)}</span>)}
      </div>
    </div>
  );
});

export default function SubtitleTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceCues, setSourceCues] = useState<Cue[]>([]);
  const [maxChars, setMaxChars] = useState(72);
  const [mode, setMode] = useState<Mode>("new-cue");
  const [editor, setEditor] = useState("generic");
  const [frame, setFrame] = useState("landscape");
  const [timeOffsetSeconds, setTimeOffsetSeconds] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [order, setOrder] = useState<Order>("chinese-first");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  // Keyed by cue text rather than position: changing the layout settings
  // re-splits cues, and every piece whose text is unchanged keeps its work.
  const [translationsByKey, setTranslationsByKey] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "ready" | "translating" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [rememberKey, setRememberKey] = useState(false);
  const [glossaryText, setGlossaryText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState("");
  const [keyAttention, setKeyAttention] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);
  // A row picked on the track may be hidden by the filter or not yet rendered;
  // scroll to it after the next render.
  const pendingScroll = useRef<number | null>(null);
  const benchBodyRef = useRef<HTMLDivElement>(null);
  // Fingerprint of the loaded file; null for the demo, which is not saved.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastSession, setLastSession] = useState<SavedSession | null>(null);
  const sourceTextRef = useRef("");
  // State rather than a ref: effects replayed by Strict Mode still see the
  // first render's `false`, so they cannot save defaults over stored values.
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    if (!storageLoaded) return;
    savePrefs(browserStorage(), { editor, frame, order, model, maxChars, mode });
  }, [storageLoaded, editor, frame, order, model, maxChars, mode]);

  useEffect(() => {
    if (!storageLoaded) return;
    saveApiKey(browserStorage(), rememberKey ? apiKey.trim() : "");
  }, [storageLoaded, apiKey, rememberKey]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = setTimeout(() => {
      saveSession(browserStorage(), {
        id: sessionId,
        name: sourceName,
        sourceText: sourceTextRef.current,
        translations: translationsByKey,
        glossary: glossaryText,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [sessionId, sourceName, translationsByKey, glossaryText]);

  useEffect(() => {
    // Restoring browser-only state has to wait until after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    const storage = browserStorage();
    const prefs = loadPrefs(storage);
    if (Object.hasOwn(EDITOR_PROFILES, prefs.editor)) setEditor(prefs.editor);
    if (prefs.frame === "landscape" || prefs.frame === "portrait") setFrame(prefs.frame);
    if (prefs.order === "chinese-first" || prefs.order === "english-first") setOrder(prefs.order);
    if (MODELS.includes(prefs.model)) setModel(prefs.model);
    if ([48, 54, 60, 66, 72, 78, 84].includes(prefs.maxChars)) setMaxChars(prefs.maxChars);
    if (prefs.mode === "new-cue" || prefs.mode === "line-break") setMode(prefs.mode);
    const savedKey = loadApiKey(storage);
    if (savedKey) {
      setApiKey(savedKey);
      setRememberKey(true);
    }
    setLastSession(listSessions(storage)[0] ?? null);
    setStorageLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const profile = useMemo(() => getSubtitleProfile(editor, frame), [editor, frame]);
  const prepared = useMemo(
    () => {
      try {
        return {
          cues: tidyCues(sourceCues, { maxChars, mode, lineChars: profile.englishLineChars }) as Cue[],
          error: "",
        };
      } catch (error) {
        return { cues: [] as Cue[], error: error instanceof Error ? error.message : "字幕断句失败。" };
      }
    },
    [sourceCues, maxChars, mode, profile],
  );
  const tidy = prepared.cues;
  const translations = useMemo(
    () => Object.fromEntries(
      tidy.flatMap((cue) => translationsByKey[cue.key] ? [[cue.id, translationsByKey[cue.key]]] : []),
    ) as Record<string, string>,
    [tidy, translationsByKey],
  );
  const activePreviewIndex = Math.min(previewIndex, Math.max(0, tidy.length - 1));
  const previewCue = tidy[activePreviewIndex];
  const cueWarnings = useMemo(
    () => Object.fromEntries(tidy.map((cue) => [
      cue.id,
      cueWarningText(cue, translations[cue.id] || "", profile),
    ])) as Record<string, string>,
    [tidy, translations, profile],
  );
  const qualityWarningCount = Object.values(cueWarnings).filter(Boolean).length;
  const stateCodes = useMemo(
    () => tidy.map((cue) => STATE_CODE[
      cueWarnings[cue.id] ? "warn" : translations[cue.id]?.trim() ? "done" : "pending"
    ]).join(""),
    [tidy, translations, cueWarnings],
  );
  const rows = useMemo(
    () => tidy
      .map((cue, index) => ({ cue, index }))
      // The row being edited stays visible even once it no longer matches.
      .filter(({ cue, index }) =>
        filter === "all" ||
        index === activePreviewIndex ||
        (filter === "pending" ? !translations[cue.id]?.trim() : Boolean(cueWarnings[cue.id]))),
    [tidy, filter, activePreviewIndex, translations, cueWarnings],
  );

  // The hero's "先看演示" link points at #demo: open the demo and show the studio.
  useEffect(() => {
    const openDemo = () => {
      if (window.location.hash !== "#demo") return;
      document.querySelector<HTMLButtonElement>("[data-demo]")?.click();
      window.history.replaceState(null, "", "#studio");
      // Jump once the demo has rendered; a smooth scroll is cancelled by the
      // layout change while the cues appear.
      setTimeout(() => document.getElementById("studio")?.scrollIntoView({ behavior: "instant" }), 50);
    };
    openDemo();
    window.addEventListener("hashchange", openDemo);
    return () => window.removeEventListener("hashchange", openDemo);
  }, []);

  useEffect(() => {
    const index = pendingScroll.current;
    if (index === null) return;
    pendingScroll.current = null;
    const row = document.getElementById(`cue-row-${index}`);
    if (row) revealRow(row, "center");
  });

  // The pinned track sits over the top of the cue list; tell the list how tall
  // it is so rows scrolled into view are not hidden beneath it.
  const hasCues = Boolean(previewCue);
  useEffect(() => {
    const body = benchBodyRef.current;
    const instrument = body?.querySelector<HTMLElement>(".instrument");
    if (!body || !instrument) return;
    const observer = new ResizeObserver(() => body.style.setProperty("--instrument-height", `${instrument.offsetHeight}px`));
    observer.observe(instrument);
    return () => observer.disconnect();
  }, [hasCues]);

  const translatedCount = useMemo(
    () => tidy.filter((cue) => translations[cue.id]?.trim()).length,
    [tidy, translations],
  );

  const overlongCount = useMemo(
    () =>
      tidy.filter(
        (cue) =>
          translations[cue.id]?.trim() &&
          !isReadableChineseSubtitle(
            translations[cue.id],
            maxChineseChars(cue, profile.chineseLineChars),
          ),
      ).length,
    [tidy, translations, profile],
  );

  const progress = tidy.length
    ? Math.round((translatedCount / tidy.length) * 100)
    : 0;

  // A restored or re-split file can be complete without a translation run.
  const progressStatus =
    status === "ready" && tidy.length > 0 && translatedCount === tidy.length ? "done" : status;
  const progressLabel =
    progressStatus === "done"
      ? "制作完成"
      : status === "translating"
        ? "正在翻译与校准…"
        : status === "error"
          ? "任务中断，当前进度已保留"
          : translatedCount
            ? "任务已暂停，可以继续"
            : "准备就绪";

  function settingsChanged() {
    setMessage("");
    setStatus(sourceCues.length ? "ready" : "idle");
  }

  async function loadText(text: string, name: string, persist = true) {
    try {
      const cues = parseSrt(text) as Cue[];
      const id = persist ? fingerprint(text) : null;
      const saved = id ? loadSession(browserStorage(), id) : null;
      const restored: Record<string, string> = saved?.translations ?? {};
      if (!persist) {
        // The demo arrives already translated, keyed for the current layout.
        const pieces = tidyCues(cues, { maxChars, mode, lineChars: profile.englishLineChars }) as Cue[];
        for (const piece of pieces) {
          const sample = DEMO_TRANSLATIONS[piece.text.replace(/\n/g, " ")];
          if (sample) restored[piece.key] = sample;
        }
      }
      const restoredCount = Object.values(restored).filter((value) => value.trim()).length;
      sourceTextRef.current = text;
      setSessionId(id);
      setSourceName(name);
      setSourceCues(cues);
      setPreviewIndex(0);
      setTranslationsByKey(restored);
      // Names belong to a film: restore its list, or keep what was typed for a new file.
      if (saved) setGlossaryText(saved.glossary ?? "");
      setStatus("ready");
      setMessage(
        !persist
          ? "当前为演示字幕，译文为示例。导入你的 SRT 并填写 API Key，即可正式翻译。"
          : restoredCount ? `已恢复上次保存的 ${restoredCount} 条译文。` : "",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "字幕文件读取失败。");
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".srt")) {
      setStatus("error");
      setMessage("请选择 .srt 字幕文件。");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus("error");
      setMessage("文件请不要超过 4 MB。");
      return;
    }
    await loadText(await file.text(), file.name);
  }

  function resumeLastSession() {
    if (!lastSession) return;
    const session = loadSession(browserStorage(), lastSession.id);
    if (session?.sourceText) {
      void loadText(session.sourceText, session.name);
    } else {
      setLastSession(null);
    }
  }

  function forgetLastSession() {
    if (!lastSession) return;
    const storage = browserStorage();
    removeSession(storage, lastSession.id);
    setLastSession(listSessions(storage)[0] ?? null);
  }

  async function translate(restart = false) {
    if (!sourceCues.length) {
      setStatus("error");
      setMessage("请先导入英文 SRT 文件。");
      return;
    }
    if (!tidy.length) {
      setStatus("error");
      setMessage(prepared.error || "没有可翻译的字幕。");
      return;
    }
    if (!apiKey.trim()) {
      setStatus("error");
      setMessage("请先在「翻译引擎」中填写 DeepSeek API Key；如尚未申请，可点击「获取 Key」。");
      keyInputRef.current?.focus();
      keyInputRef.current?.scrollIntoView({ block: "center" });
      setKeyAttention(true);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("translating");
    setMessage("");
    const keyById = new Map(tidy.map((cue) => [cue.id, cue.key]));
    const nextTranslations: Record<string, string> = restart
      ? {}
      : Object.fromEntries(
          Object.entries(translations).filter(([, text]) => text.trim()),
        );
    if (restart) setTranslationsByKey({});
    const pending = tidy.filter((cue) => !nextTranslations[cue.id]?.trim());

    try {
      if (!pending.length) {
        setStatus("done");
        setMessage("全部字幕已经翻译完成。");
        return;
      }

      const lineChars = profile.chineseLineChars;
      const glossary = parseGlossary(glossaryText);
      await translateInBatches(
        pending,
        async (group: Cue[], signal: AbortSignal) => {
          const response = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              apiKey: apiKey.trim(),
              model,
              glossary,
              items: group.map((cue) => ({
                id: cue.id,
                text: cue.text.replace(/\n/g, " "),
                context: (cue.contextText || cue.text).replace(/\n/g, " "),
                before: cue.previousText,
                maxChineseChars: maxChineseChars(cue, lineChars),
              })),
            }),
          });
          let data = null;
          try {
            data = await response.json();
          } catch {
            // The queue treats an unreadable body as a failed batch.
          }
          return { status: response.status, data };
        },
        {
          signal: controller.signal,
          onProgress: (received: Record<string, string>) => {
            Object.assign(nextTranslations, received);
            setTranslationsByKey((current) => {
              const next = { ...current };
              for (const [id, text] of Object.entries(received)) next[keyById.get(id)!] = text;
              return next;
            });
          },
        },
      );

      const finalOverlongCount = tidy.filter(
        (cue) =>
          nextTranslations[cue.id]?.trim() &&
          !isReadableChineseSubtitle(
            nextTranslations[cue.id],
            maxChineseChars(cue, profile.chineseLineChars),
          ),
      ).length;
      setStatus("done");
      setMessage(
        finalOverlongCount
          ? `翻译完成，其中 ${finalOverlongCount} 条偏长，建议在预览中精简后下载。`
          : "翻译完成，可以检查预览并下载。",
      );
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("ready");
        setMessage("已停止翻译。");
      } else {
        setStatus("error");
        const finished = Object.keys(nextTranslations).length;
        const detail = error instanceof Error ? error.message : "翻译失败。";
        setMessage(
          `${detail} 已保留完成的 ${finished} 条，点击按钮可从这里继续。`,
        );
      }
    } finally {
      abortRef.current = null;
    }
  }

  const updateTranslation = useCallback((key: string, value: string) => {
    setTranslationsByKey((current) => ({ ...current, [key]: value }));
  }, []);

  // ⌘/Ctrl + ↑/↓ moves between the rows currently shown, whatever the filter.
  const navigateFrom = useCallback((index: number, step: 1 | -1) => {
    const shown = [...document.querySelectorAll<HTMLElement>("[data-cue-index]")];
    const target = shown[shown.findIndex((row) => Number(row.dataset.cueIndex) === index) + step];
    if (!target) return;
    revealRow(target, "nearest");
    target.querySelector("textarea")?.focus({ preventScroll: true });
    setPreviewIndex(Number(target.dataset.cueIndex));
  }, []);

  const selectFromTrack = useCallback((index: number) => {
    const row = document.getElementById(`cue-row-${index}`);
    if (row) revealRow(row, "center");
    else pendingScroll.current = index;
    setPreviewIndex(index);
    setFilter((current) => (current === "all" ? current : "all"));
  }, []);

  function download(bilingual = true) {
    if (!tidy.length) return;
    if (bilingual && translatedCount !== tidy.length) {
      setStatus("error");
      setMessage("还有字幕尚未翻译完成。");
      return;
    }

    let content: string;
    try {
      content = serializeSrt(tidy, translations, {
        ...profile,
        order,
        bilingual,
        timeOffsetMs: timeOffsetSeconds * 1000,
      });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "导出失败。");
      return;
    }
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName(sourceName, bilingual, profile.suffix);
    anchor.click();
    // Safari can cancel the download if the URL is revoked in the same task.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setToast(`已生成${bilingual ? "中英双语" : "英文"} SRT（UTF-8 BOM · CRLF），开始下载`);
    setTimeout(() => setToast(""), 3_000);
    if (bilingual && overlongCount) {
      setStatus("done");
      setMessage(`已导出；其中 ${overlongCount} 条偏长，建议播放时重点检查。`);
    }
  }

  const editing = status === "translating";
  const editorHelpTitle = editor === "resolve" ? "导入达芬奇的方法" : editor === "premiere" ? "导入 PR 的方法" : "导入剪辑软件的方法";
  const pendingCount = tidy.length - translatedCount;

  return (
    <section id="studio" className={`studio ${sourceCues.length ? "has-file" : ""}`} aria-labelledby="studio-title">
      <header className="studio-head">
        <div>
          <p className="eyebrow">工作台</p>
          <h2 id="studio-title">开始制作双语字幕</h2>
          <p className="mobile-tip">逐条校对建议在电脑上完成；手机端适合查看进度与少量修改。</p>
        </div>
        <dl className="telemetry" aria-label="当前任务概况">
          <div><dt>原字幕</dt><dd>{sourceCues.length || "—"}</dd></div>
          <div><dt>条目</dt><dd>{tidy.length || "—"}</dd></div>
          <div><dt>时长</dt><dd>{sourceCues.length ? formatDuration(subtitleDuration(sourceCues)) : "—"}</dd></div>
          <div className="telemetry-progress"><dt>完成</dt><dd>{sourceCues.length ? `${progress}%` : "—"}</dd></div>
        </dl>
        <span className={`signal-status ${progressStatus}`}><i aria-hidden="true" />{sourceCues.length ? progressLabel : "等待输入"}</span>
      </header>

      <div className="lab-grid">
        <aside className="rack" aria-label="字幕制作设置">
          <div className="rack-modules">
            <section className="module">
              <h2><span className="module-index">01</span>导入字幕</h2>
              <div
                className={`drop-zone ${dragging ? "dragging" : ""} ${sourceCues.length ? "has-file" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!editing) void loadFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt,application/x-subrip,text/plain"
                  disabled={editing}
                  onChange={(event) => void loadFile(event.target.files?.[0])}
                  aria-label="选择 SRT 文件"
                />
                {sourceCues.length ? (
                  <>
                    <strong title={sourceName}>{sourceName}</strong>
                    <div className="file-meta">
                      <span>{sourceCues.length} 条 · {formatDuration(subtitleDuration(sourceCues))}</span>
                      <button className="ghost-button" type="button" disabled={editing} onClick={() => fileInputRef.current?.click()}>更换</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button className="outline-button" type="button" onClick={() => fileInputRef.current?.click()}>选择 SRT 文件</button>
                    <span>或拖到这里 · 最大 4 MB</span>
                  </>
                )}
              </div>
              {!sourceCues.length && lastSession && (
                <div className="resume-card">
                  <span>上次的任务 · {formatSavedAt(lastSession.savedAt)}</span>
                  <strong title={lastSession.name}>{lastSession.name}</strong>
                  <div className="file-meta">
                    <span>{lastSession.hasSource ? `已翻译 ${lastSession.translated} 条` : `已翻译 ${lastSession.translated} 条 · 重新选择该文件即可继续`}</span>
                    <span>
                      {lastSession.hasSource && <button className="ghost-button accent" type="button" onClick={resumeLastSession}>继续</button>}
                      <button className="ghost-button" type="button" onClick={forgetLastSession}>删除</button>
                    </span>
                  </div>
                </div>
              )}
              {!sourceCues.length && <button className="ghost-button demo-button" type="button" onClick={() => void loadText(SAMPLE_SRT, "演示字幕.srt", false)}>观看演示</button>}
            </section>

            <section className="module">
              <h2><span className="module-index">02</span>断句与排版</h2>
              <fieldset disabled={editing}>
                <div className="field">
                  <span className="field-label" id="editor-label">导入平台</span>
                  <div className="segmented three" role="radiogroup" aria-labelledby="editor-label">
                    {Object.keys(EDITOR_PROFILES).map((value) => (
                      <label key={value}><input type="radio" name="editor" value={value} checked={editor === value} onChange={() => setEditor(value)} /><span>{EDITOR_SHORT_LABELS[value] ?? value}</span></label>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label" id="frame-label">画幅</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="frame-label">
                    <label><input type="radio" name="frame" value="landscape" checked={frame === "landscape"} onChange={() => { setFrame("landscape"); settingsChanged(); }} /><span>横屏 16:9</span></label>
                    <label><input type="radio" name="frame" value="portrait" checked={frame === "portrait"} onChange={() => { setFrame("portrait"); settingsChanged(); }} /><span>竖屏 9:16</span></label>
                  </div>
                </div>
                <div className="field">
                  <span className="field-label" id="order-label">双语顺序</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="order-label">
                    <label><input type="radio" name="order" value="chinese-first" checked={order === "chinese-first"} onChange={() => setOrder("chinese-first")} /><span>中文在上</span></label>
                    <label><input type="radio" name="order" value="english-first" checked={order === "english-first"} onChange={() => setOrder("english-first")} /><span>英文在上</span></label>
                  </div>
                </div>
                <p className="rule-note">只拆分，不合并 · 句末另起一条 · 短句单行</p>

                <details className="advanced-settings">
                  <summary>高级参数</summary>
                  <div className="details-content">
                    <label className="field-label slider-label" htmlFor="max-chars">
                      每条英文长度 <output htmlFor="max-chars">{maxChars}</output>
                    </label>
                    <input id="max-chars" className="range" type="range" min="48" max="84" step="6" value={maxChars} onChange={(event) => { setMaxChars(Number(event.target.value)); settingsChanged(); }} />
                    <span className="field-hint">每行英文约 {profile.englishLineChars} 字符，中文约 {profile.chineseLineChars} 字</span>
                    <div className="field">
                      <span className="field-label" id="mode-label">超长句</span>
                      <div className="segmented" role="radiogroup" aria-labelledby="mode-label">
                        <label><input type="radio" name="mode" value="new-cue" checked={mode === "new-cue"} onChange={() => { setMode("new-cue"); settingsChanged(); }} /><span>拆成新条目</span></label>
                        <label><input type="radio" name="mode" value="line-break" checked={mode === "line-break"} onChange={() => { setMode("line-break"); settingsChanged(); }} /><span>仅换行</span></label>
                      </div>
                    </div>
                    <label className="field" htmlFor="time-offset">
                      <span className="field-label">导出整体时间偏移（秒）</span>
                      <input id="time-offset" type="number" step="0.001" min="-36000" max="36000" value={timeOffsetSeconds} onChange={(event) => setTimeOffsetSeconds(Number(event.target.value) || 0)} />
                    </label>
                    <span className="field-hint">默认 0，仅在视频时间线需要偏移时调整。</span>
                  </div>
                </details>
              </fieldset>
              {prepared.error && <p className="status-message error" role="alert">{prepared.error}</p>}
            </section>

            <section className="module">
              <h2><span className="module-index">03</span>翻译引擎<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">获取 Key ↗</a></h2>
              <fieldset disabled={editing}>
                <label className="field" htmlFor="api-key">
                  <span className="field-label">DeepSeek API Key</span>
                  <input ref={keyInputRef} id="api-key" className={keyAttention ? "attention" : ""} type="password" autoComplete="off" spellCheck="false" value={apiKey} placeholder="sk-…" onChange={(event) => { setApiKey(event.target.value); setKeyAttention(false); }} />
                </label>
                <div className="key-options">
                  <label className="checkbox-field">
                    <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
                    在本机浏览器记住 Key
                  </label>
                  {apiKey && <button className="ghost-button" type="button" onClick={() => { setApiKey(""); setRememberKey(false); }}>清除 Key</button>}
                </div>
                <p className="key-note">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="3" y="7" width="10" height="7.5" rx="2" fill="currentColor" /></svg>
                  API Key 默认不保存；勾选后仅存于本机浏览器。翻译时经本站转发至 DeepSeek，本站不做保存。
                </p>
                <div className="field">
                  <span className="field-label" id="model-label">模型</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="model-label">
                    <label><input type="radio" name="model" value="deepseek-v4-flash" checked={model === "deepseek-v4-flash"} onChange={() => setModel("deepseek-v4-flash")} /><span>V4 Flash · 快速</span></label>
                    <label><input type="radio" name="model" value="deepseek-v4-pro" checked={model === "deepseek-v4-pro"} onChange={() => setModel("deepseek-v4-pro")} /><span>V4 Pro · 质量</span></label>
                  </div>
                </div>
                <label className="field" htmlFor="glossary">
                  <span className="field-label">人名与术语（可选）</span>
                  <textarea id="glossary" rows={3} spellCheck="false" value={glossaryText} placeholder={"每行一条，例如：\nZane = 赞恩\nKubernetes = Kubernetes"} onChange={(event) => setGlossaryText(event.target.value)} />
                </label>
                <span className="field-hint">整部字幕统一使用这些译名；修改后只影响之后翻译的条目。</span>
              </fieldset>
            </section>

            <details className="module platform-help">
              <summary>{editorHelpTitle}</summary>
              <div className="details-content">
                <p>{profile.importHelp}</p>
                <p>{profile.styleHelp}</p>
                <p>字体、字号和位置在剪辑软件内设置。</p>
                <a href={profile.sourceUrl} target="_blank" rel="noreferrer">导入说明 ↗</a>{"  "}<a href={profile.styleSourceUrl} target="_blank" rel="noreferrer">样式说明 ↗</a>
              </div>
            </details>
          </div>

          <div className={`dock ${progressStatus}`} aria-live="polite">
            <div className="dock-readout">
              <strong className="dock-figure">{sourceCues.length ? progress : 0}<small>%</small></strong>
              <div>
                <span className="dock-label">{sourceCues.length ? progressLabel : "等待输入"}</span>
                <span className="dock-count">已完成 {translatedCount}/{tidy.length}</span>
              </div>
            </div>
            <div className="meter" role="progressbar" aria-label="双语字幕制作进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <i style={{ width: `${progress}%` }} />
            </div>
            {(status !== "done" || translatedCount !== tidy.length) && <div className="task-actions">
              {editing ? (
                <button className="outline-button" type="button" onClick={() => abortRef.current?.abort()}>暂停任务</button>
              ) : (
                <>
                  <button className="primary-button" type="button" disabled={!tidy.length || translatedCount === tidy.length} onClick={() => void translate()}>
                    {translatedCount > 0 && translatedCount < tidy.length
                      ? `继续任务 · ${tidy.length - translatedCount} 条`
                      : status === "error" ? "继续任务" : translatedCount && translatedCount === tidy.length ? "翻译完成" : "开始翻译"}
                  </button>
                  {status === "error" && sourceCues.length > 0 && <button className="outline-button" type="button" onClick={() => void translate(true)}>重新开始</button>}
                </>
              )}
            </div>}
            {message && (status !== "done" || overlongCount > 0) && <p className={`status-message ${status === "error" ? "error" : ""}`} role={status === "error" ? "alert" : "status"}>{message}</p>}
          </div>
        </aside>

        <section className="bench" aria-label="字幕预览与下载">
          <div className="bench-bar">
            <div className="bench-title">
              <h2>字幕预览</h2>
              <p>{sourceCues.length ? `${sourceCues.length} 条原字幕 → ${tidy.length} 条` : "导入后可校对、翻译和下载"}{qualityWarningCount > 0 && ` · ${qualityWarningCount} 条需检查`}</p>
            </div>
            {tidy.length > 0 && (
              <div className="filters" role="radiogroup" aria-label="筛选字幕">
                {([["all", "全部", tidy.length], ["pending", "未翻译", pendingCount], ["warn", "需检查", qualityWarningCount]] as const).map(([value, label, count]) => (
                  <label key={value} className={value}><input type="radio" name="filter" value={value} checked={filter === value} onChange={() => setFilter(value)} /><span>{label}<b>{count}</b></span></label>
                ))}
              </div>
            )}
            <div className="bench-actions">
              <button className="outline-button" type="button" disabled={!tidy.length} onClick={() => download(false)}>下载英文</button>
              <button className="primary-button" type="button" disabled={!tidy.length || translatedCount !== tidy.length} onClick={() => download(true)}>下载双语 SRT</button>
            </div>
          </div>

          {previewCue ? (
            <div className="bench-body" ref={benchBodyRef}>
              <div className="instrument">
                <SignalTrack cues={tidy} stateCodes={stateCodes} activeIndex={activePreviewIndex} onSelect={selectFromTrack} />
                <div className="legend" aria-hidden="true">
                  <span className="done">已翻译</span><span className="pending">待翻译</span><span className="warn">需检查</span>
                  <span className="shortcut"><kbd>⌘/Ctrl</kbd>+<kbd>↑↓</kbd> 切换条目</span>
                </div>
                <details className="monitor">
                  <summary>画面预览<span>第 {activePreviewIndex + 1} 条 · {formatTimestamp(previewCue.startMs + timeOffsetSeconds * 1000)}</span></summary>
                  <div className={`preview-screen ${frame}`}>
                    <div className={`screen-subtitles ${order}`}>
                      {translations[previewCue.id]?.trim() && <p className="screen-chinese">{wrapChineseSubtitle(translations[previewCue.id], profile.chineseLineChars)}</p>}
                      <p className="screen-english">{previewCue.text}</p>
                    </div>
                  </div>
                  <div className="preview-navigation">
                    <button className="ghost-button" type="button" disabled={activePreviewIndex === 0} onClick={() => setPreviewIndex(activePreviewIndex - 1)}>← 上一条</button>
                    <span>{activePreviewIndex + 1} / {tidy.length}</span>
                    <button className="ghost-button" type="button" disabled={activePreviewIndex === tidy.length - 1} onClick={() => setPreviewIndex(activePreviewIndex + 1)}>下一条 →</button>
                  </div>
                  <p className="field-hint preview-hint">排版模拟，最终显示以剪辑软件内的样式为准。</p>
                </details>
              </div>
              <div className="cue-list">
                {rows.map(({ cue, index }) => (
                  <SubtitleRow
                    key={cue.id}
                    cue={cue}
                    index={index}
                    translation={translations[cue.id] || ""}
                    warnings={cueWarnings[cue.id]}
                    active={activePreviewIndex === index}
                    order={order}
                    timeOffsetMs={timeOffsetSeconds * 1000}
                    chineseLineChars={profile.chineseLineChars}
                    placeholder={status === "done" ? "编辑译文" : "中文译文"}
                    onEdit={updateTranslation}
                    onSelect={setPreviewIndex}
                    onNavigate={navigateFrom}
                  />
                ))}
                {!rows.length && <p className="list-empty">{filter === "pending" ? "没有未翻译的条目" : "没有需要检查的条目"}</p>}
              </div>
            </div>
          ) : (
            <div className="empty-bench">
              <LogoMark className="hero-mark" />
              <p>将英文字幕拖放到此处</p>
              <span>支持 Buzz 导出的 SRT 文件；也可以先观看演示效果。</span>
              <div className="hero-actions">
                <button className="primary-button" type="button" disabled={editing} onClick={() => fileInputRef.current?.click()}>选择 SRT 文件</button>
                <button className="ghost-button" type="button" data-demo onClick={() => void loadText(SAMPLE_SRT, "演示字幕.srt", false)}>观看演示（无需 API Key）›</button>
              </div>
            </div>
          )}
        </section>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
