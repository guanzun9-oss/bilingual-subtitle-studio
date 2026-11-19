"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatTimestamp,
  getSubtitleWarnings,
  isReadableSubtitle,
  parseSrt,
  serializeSrt,
  subtitleDuration,
  tidyCues,
  wrapSubtitle,
} from "@/lib/srt-core.mjs";
import LogoMark from "./logo-mark";
import { DEMO_TRANSLATIONS, SAMPLE_SRT } from "@/lib/demo.mjs";
import { parseGlossary } from "@/lib/glossary.mjs";
import { format, type Locale, type Messages } from "@/lib/i18n";
import {
  LANGUAGES,
  getLanguage,
  guessLanguage,
  isLanguage,
  maxTranslationChars,
} from "@/lib/languages.mjs";
import { DEFAULT_PROVIDER, PROVIDERS, PROVIDER_IDS, isProvider, resolveModel } from "@/lib/providers.mjs";
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
type Order = "translation-first" | "source-first";
type Content = "bilingual" | "source" | "translation";
type Editor = keyof Messages["editors"];
type Translations = Record<string, string>;

type SavedSession = {
  id: string;
  name: string;
  savedAt: number;
  translated: number;
  hasSource: boolean;
};

type Profile = ReturnType<typeof getSubtitleProfile>;

const PROVIDER_CONFIG = PROVIDERS as Record<string, { label: string; keyUrl: string; keyHint: string; models: string[]; strictModels?: boolean }>;

/** localStorage, or undefined where the browser blocks it (e.g. some private modes). */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function formatSavedAt(savedAt: number, locale: string) {
  return new Date(savedAt).toLocaleString(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Interface text for an error from the subtitle core, which carries a code. */
function errorText(error: unknown, t: Messages, fallback: string) {
  const code = (error as { code?: string })?.code;
  if (code && Object.hasOwn(t.errors, code)) return t.errors[code as keyof Messages["errors"]];
  return fallback;
}

type CueState = "done" | "pending" | "warn";
type Filter = "all" | "pending" | "warn";

const STATE_CODE: Record<CueState, string> = { done: "d", pending: "p", warn: "w" };

function formatClock(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

// Quality checks wrap and measure the translation. Re-running them for every
// cue on each keystroke made editing long files slow, so reuse the result
// until the cue, its translation, the layout profile or the wording changes.
const warningCache = new WeakMap<Cue, { translation: string; profile: object; wording: object; text: string }>();

function cueWarningText(cue: Cue, translation: string, profile: Profile, wording: Messages["warnings"]) {
  const cached = warningCache.get(cue);
  if (cached && cached.translation === translation && cached.profile === profile && cached.wording === wording) {
    return cached.text;
  }
  const text = getSubtitleWarnings(cue, translation, profile)
    .map(({ code, limit }) => format(wording[code as keyof typeof wording] ?? code, { limit }))
    .join(" · ");
  warningCache.set(cue, { translation, profile, wording, text });
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
  targetLineChars: number;
  sourceLanguage: string;
  targetLanguage: string;
  placeholder: string;
  t: Messages["tool"];
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

function dirOf(code: string) {
  return getLanguage(code).rtl ? "rtl" : "ltr";
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
  targetLineChars,
  sourceLanguage,
  targetLanguage,
  placeholder,
  t,
  onEdit,
  onSelect,
  onNavigate,
}: SubtitleRowProps) {
  const state: CueState = warnings ? "warn" : translation.trim() ? "done" : "pending";
  return (
    <article id={`cue-row-${index}`} data-cue-index={index} className={`cue-row ${state} ${active ? "active" : ""}`}>
      <button className="cue-index" type="button" aria-label={format(t.previewCue, { index: index + 1 })} aria-pressed={active} onClick={() => onSelect(index)}>
        {String(index + 1).padStart(3, "0")}
      </button>
      <div className="cue-time">
        <time>{formatTimestamp(cue.startMs + timeOffsetMs)}</time>
        <time>{formatTimestamp(cue.endMs + timeOffsetMs)}</time>
        <span>{((cue.endMs - cue.startMs) / 1000).toFixed(2)}s</span>
      </div>
      <div className={`cue-copy ${order}`}>
        <textarea
          aria-label={format(t.editCue, { index: index + 1 })}
          lang={targetLanguage}
          dir={dirOf(targetLanguage)}
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
          rows={Math.max(1, wrapSubtitle(translation, targetLineChars, targetLanguage).split("\n").length)}
        />
        <p lang={sourceLanguage} dir={dirOf(sourceLanguage)}>{cue.text}</p>
      </div>
      <span className="cue-state" aria-hidden="true" />
      {warnings && <p className="cue-warning">{format(t.check, { warnings })}</p>}
    </article>
  );
});

type SignalTrackProps = {
  cues: Cue[];
  /** One letter per cue (see STATE_CODE), so the track only redraws when a state changes. */
  stateCodes: string;
  activeIndex: number;
  label: string;
  onSelect: (index: number) => void;
};

/** The whole subtitle track at a glance: every cue drawn at its time, coloured by state. */
const SignalTrack = memo(function SignalTrack({ cues, stateCodes, activeIndex, label, onSelect }: SignalTrackProps) {
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

  // Time runs left to right in every interface language.
  return (
    <div className="signal-track" dir="ltr">
      <div
        className="track-plot"
        role="img"
        aria-label={format(label, { count: cues.length, duration: formatClock(duration) })}
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

type SubtitleToolProps = {
  t: Messages;
  locale: Locale;
  /** Translation language preselected for this interface language. */
  defaultTarget: string;
};

export default function SubtitleTool({ t: messages, locale, defaultTarget }: SubtitleToolProps) {
  const t = messages.tool;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceCues, setSourceCues] = useState<Cue[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState(defaultTarget);
  const [detectedLanguage, setDetectedLanguage] = useState("");
  const [maxChars, setMaxChars] = useState(72);
  const [mode, setMode] = useState<Mode>("new-cue");
  const [editor, setEditor] = useState<Editor>("generic");
  const [frame, setFrame] = useState("landscape");
  const [timeOffsetSeconds, setTimeOffsetSeconds] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [order, setOrder] = useState<Order>("translation-first");
  const [provider, setProvider] = useState<string>(locale.startsWith("zh") ? DEFAULT_PROVIDER : "openai");
  const [models, setModels] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  // Keyed by target language, then by cue text rather than position:
  // changing the layout settings re-splits cues, and every piece whose text
  // is unchanged keeps its work; switching language keeps the other's work.
  const [allTranslations, setAllTranslations] = useState<Record<string, Translations>>({});
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

  const providerConfig = PROVIDER_CONFIG[provider];
  const model = resolveModel(provider, models[provider]);
  const apiKey = apiKeys[provider] ?? "";
  const translationsByKey = useMemo(() => allTranslations[targetLanguage] ?? {}, [allTranslations, targetLanguage]);
  const sameLanguage = sourceLanguage === targetLanguage;

  useEffect(() => {
    if (!storageLoaded) return;
    savePrefs(browserStorage(), { editor, frame, order, provider, models, maxChars, mode, targetLanguage });
  }, [storageLoaded, editor, frame, order, provider, models, maxChars, mode, targetLanguage]);

  useEffect(() => {
    if (!storageLoaded) return;
    saveApiKey(browserStorage(), rememberKey ? apiKey.trim() : "", provider);
  }, [storageLoaded, apiKey, rememberKey, provider]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = setTimeout(() => {
      saveSession(browserStorage(), {
        id: sessionId,
        name: sourceName,
        sourceText: sourceTextRef.current,
        translations: translationsByKey,
        target: targetLanguage,
        sourceLanguage,
        byTarget: allTranslations,
        glossary: glossaryText,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [sessionId, sourceName, translationsByKey, targetLanguage, sourceLanguage, allTranslations, glossaryText]);

  useEffect(() => {
    // Restoring browser-only state has to wait until after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    const storage = browserStorage();
    const prefs = loadPrefs(storage);
    if (Object.hasOwn(EDITOR_PROFILES, prefs.editor)) setEditor(prefs.editor);
    if (prefs.frame === "landscape" || prefs.frame === "portrait") setFrame(prefs.frame);
    // Older versions stored "chinese-first" / "english-first".
    if (prefs.order === "translation-first" || prefs.order === "chinese-first") setOrder("translation-first");
    if (prefs.order === "source-first" || prefs.order === "english-first") setOrder("source-first");
    if (isProvider(prefs.provider)) setProvider(prefs.provider);
    const savedModels = prefs.models && typeof prefs.models === "object" ? { ...prefs.models } : {};
    // Before other providers existed, the DeepSeek model was stored on its own.
    if (typeof prefs.model === "string" && !savedModels.deepseek) savedModels.deepseek = prefs.model;
    setModels(Object.fromEntries(Object.entries(savedModels).filter(([, value]) => typeof value === "string")) as Record<string, string>);
    if (isLanguage(prefs.targetLanguage)) setTargetLanguage(prefs.targetLanguage);
    if ([48, 54, 60, 66, 72, 78, 84].includes(prefs.maxChars)) setMaxChars(prefs.maxChars);
    if (prefs.mode === "new-cue" || prefs.mode === "line-break") setMode(prefs.mode);
    const savedKeys = Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, loadApiKey(storage, id)]).filter(([, key]) => key),
    );
    if (Object.keys(savedKeys).length) {
      setApiKeys(savedKeys);
      setRememberKey(true);
    }
    setLastSession(listSessions(storage)[0] ?? null);
    setStorageLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const profile = useMemo(
    () => getSubtitleProfile(editor, frame, sourceLanguage, targetLanguage),
    [editor, frame, sourceLanguage, targetLanguage],
  );
  // The length slider is in English characters; other languages scale it to their own width.
  const sourceMaxChars = Math.max(16, Math.round((maxChars * getLanguage(sourceLanguage).lineChars) / 42));
  const prepared = useMemo(
    () => {
      try {
        return {
          cues: tidyCues(sourceCues, {
            maxChars: sourceMaxChars,
            mode,
            lineChars: profile.sourceLineChars,
            language: sourceLanguage,
          }) as Cue[],
          error: "",
        };
      } catch (error) {
        return { cues: [] as Cue[], error: errorText(error, messages, t.splitFailed) };
      }
    },
    [sourceCues, sourceMaxChars, mode, profile, sourceLanguage, messages, t.splitFailed],
  );
  const tidy = prepared.cues;
  const translations = useMemo(
    () => Object.fromEntries(
      tidy.flatMap((cue) => translationsByKey[cue.key] ? [[cue.id, translationsByKey[cue.key]]] : []),
    ) as Translations,
    [tidy, translationsByKey],
  );
  const activePreviewIndex = Math.min(previewIndex, Math.max(0, tidy.length - 1));
  const previewCue = tidy[activePreviewIndex];
  const cueWarnings = useMemo(
    () => Object.fromEntries(tidy.map((cue) => [
      cue.id,
      cueWarningText(cue, translations[cue.id] || "", profile, messages.warnings),
    ])) as Record<string, string>,
    [tidy, translations, profile, messages.warnings],
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

  // The hero's demo link points at #demo: open the demo and show the studio.
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
          !isReadableSubtitle(
            translations[cue.id],
            maxTranslationChars(cue.endMs - cue.startMs, targetLanguage, frame),
            targetLanguage,
          ),
      ).length,
    [tidy, translations, targetLanguage, frame],
  );

  const progress = tidy.length
    ? Math.round((translatedCount / tidy.length) * 100)
    : 0;

  // A restored or re-split file can be complete without a translation run.
  const progressStatus =
    status === "ready" && tidy.length > 0 && translatedCount === tidy.length ? "done" : status;
  const progressLabel =
    progressStatus === "done"
      ? t.stateDone
      : status === "translating"
        ? t.stateTranslating
        : status === "error"
          ? t.stateError
          : translatedCount
            ? t.statePaused
            : t.stateReady;

  function settingsChanged() {
    setMessage("");
    setStatus(sourceCues.length ? "ready" : "idle");
  }

  /** Change the source language, keeping the translation language different. */
  function chooseSource(code: string) {
    setSourceLanguage(code);
    if (code === targetLanguage) setTargetLanguage(code === defaultTarget ? (code === "en" ? "zh-Hans" : "en") : defaultTarget);
  }

  async function loadText(text: string, name: string, persist = true) {
    try {
      const cues = parseSrt(text) as Cue[];
      const id = persist ? fingerprint(text) : null;
      const saved = id ? loadSession(browserStorage(), id) : null;
      // A saved session knows its languages; otherwise look at the text.
      const guessed = persist ? guessLanguage(cues.map((cue) => cue.text).join("\n")) : "en";
      const source = isLanguage(saved?.sourceLanguage) ? saved.sourceLanguage : isLanguage(guessed) ? guessed : sourceLanguage;
      let target = isLanguage(saved?.target) && saved.target !== source ? saved.target : targetLanguage;
      if (target === source) target = source === defaultTarget ? (source === "en" ? "zh-Hans" : "en") : defaultTarget;
      const restored: Record<string, Translations> = saved
        ? { ...(saved.byTarget ?? {}), [saved.target ?? "zh-Hans"]: saved.translations }
        : {};
      let demoHasSample = true;
      if (!persist) {
        // The demo arrives already translated, keyed for the current layout.
        const samples = (DEMO_TRANSLATIONS as Record<string, Translations>)[target];
        demoHasSample = Boolean(samples);
        const pieces = tidyCues(cues, { maxChars, mode, lineChars: getSubtitleProfile(editor, frame, "en", target).sourceLineChars, language: "en" }) as Cue[];
        const sampleByKey: Translations = {};
        for (const piece of pieces) {
          const sample = samples?.[piece.text.replace(/\n/g, " ")];
          if (sample) sampleByKey[piece.key] = sample;
        }
        restored[target] = sampleByKey;
      }
      const restoredCount = Object.values(restored[target] ?? {}).filter((value) => value.trim()).length;
      sourceTextRef.current = text;
      setSessionId(id);
      setSourceName(name);
      setSourceLanguage(source);
      setTargetLanguage(target);
      setDetectedLanguage(persist && !saved && guessed === source ? guessed : "");
      setSourceCues(cues);
      setPreviewIndex(0);
      setAllTranslations(restored);
      // Names belong to a film: restore its list, or keep what was typed for a new file.
      if (saved) setGlossaryText(saved.glossary ?? "");
      setStatus("ready");
      setMessage(
        !persist
          ? demoHasSample ? t.demoLoaded : t.demoNoSample
          : restoredCount ? format(t.restored, { count: restoredCount }) : "",
      );
    } catch (error) {
      setStatus("error");
      setMessage(errorText(error, messages, t.readFailed));
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".srt")) {
      setStatus("error");
      setMessage(t.chooseSrt);
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus("error");
      setMessage(t.tooLarge);
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

  function setTargetTranslations(update: (current: Translations) => Translations) {
    setAllTranslations((all) => ({ ...all, [targetLanguage]: update(all[targetLanguage] ?? {}) }));
  }

  async function translate(restart = false) {
    if (!sourceCues.length) {
      setStatus("error");
      setMessage(t.importFirst);
      return;
    }
    if (!tidy.length) {
      setStatus("error");
      setMessage(prepared.error || t.nothingToTranslate);
      return;
    }
    if (sameLanguage) {
      setStatus("error");
      setMessage(t.sameLanguage);
      return;
    }
    if (!apiKey.trim()) {
      setStatus("error");
      setMessage(format(t.needKey, { provider: providerConfig.label }));
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
    const nextTranslations: Translations = restart
      ? {}
      : Object.fromEntries(
          Object.entries(translations).filter(([, text]) => text.trim()),
        );
    if (restart) setTargetTranslations(() => ({}));
    const pending = tidy.filter((cue) => !nextTranslations[cue.id]?.trim());
    // The target can change while a run is going; results belong to the one it started with.
    const runTarget = targetLanguage;

    try {
      if (!pending.length) {
        setStatus("done");
        setMessage(t.allDone);
        return;
      }

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
              provider,
              model,
              sourceLanguage,
              targetLanguage: runTarget,
              locale,
              glossary,
              items: group.map((cue) => ({
                id: cue.id,
                text: cue.text.replace(/\n/g, " "),
                context: (cue.contextText || cue.text).replace(/\n/g, " "),
                before: cue.previousText,
                maxChars: maxTranslationChars(cue.endMs - cue.startMs, runTarget, frame),
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
          messages: messages.queue,
          onProgress: (received: Translations) => {
            Object.assign(nextTranslations, received);
            setAllTranslations((all) => {
              const next = { ...(all[runTarget] ?? {}) };
              for (const [id, text] of Object.entries(received)) next[keyById.get(id)!] = text;
              return { ...all, [runTarget]: next };
            });
          },
        },
      );

      const finalOverlongCount = tidy.filter(
        (cue) =>
          nextTranslations[cue.id]?.trim() &&
          !isReadableSubtitle(
            nextTranslations[cue.id],
            maxTranslationChars(cue.endMs - cue.startMs, runTarget, frame),
            runTarget,
          ),
      ).length;
      setStatus("done");
      setMessage(
        finalOverlongCount
          ? format(t.doneOverlong, { count: finalOverlongCount })
          : t.done,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("ready");
        setMessage(t.stopped);
      } else {
        setStatus("error");
        const finished = Object.keys(nextTranslations).length;
        const detail = error instanceof Error ? error.message : t.translateFailed;
        setMessage(format(t.failedKept, { detail, count: finished }));
      }
    } finally {
      abortRef.current = null;
    }
  }

  const updateTranslation = useCallback((key: string, value: string) => {
    setAllTranslations((all) => ({ ...all, [targetLanguage]: { ...(all[targetLanguage] ?? {}), [key]: value } }));
  }, [targetLanguage]);

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

  function download(content: Content) {
    if (!tidy.length) return;
    if (content !== "source" && translatedCount !== tidy.length) {
      setStatus("error");
      setMessage(t.notFinished);
      return;
    }

    let srt: string;
    try {
      srt = serializeSrt(tidy, translations, {
        ...profile,
        order,
        content,
        timeOffsetMs: timeOffsetSeconds * 1000,
      });
    } catch (error) {
      setStatus("error");
      setMessage(errorText(error, messages, t.exportFailed));
      return;
    }
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName(sourceName, content, profile.suffix, sourceLanguage, targetLanguage);
    anchor.click();
    // Safari can cancel the download if the URL is revoked in the same task.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    const kind = content === "bilingual" ? t.kindBilingual : content === "source" ? t.kindSource : t.kindTranslation;
    setToast(format(t.downloaded, { kind }));
    setTimeout(() => setToast(""), 3_000);
    if (content !== "source" && overlongCount) {
      setStatus("done");
      setMessage(format(t.exportedOverlong, { count: overlongCount }));
    }
  }

  const editing = status === "translating";
  const editorText = messages.editors[editor];
  const pendingCount = tidy.length - translatedCount;
  const detectedName = getLanguage(sourceLanguage).name;
  const languageOptions = LANGUAGES.map((language) => (
    <option key={language.code} value={language.code} lang={language.code}>{language.name}</option>
  ));

  return (
    <section id="studio" className={`studio ${sourceCues.length ? "has-file" : ""}`} aria-labelledby="studio-title">
      <header className="studio-head">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 id="studio-title">{t.title}</h2>
          <p className="mobile-tip">{t.mobileTip}</p>
        </div>
        <dl className="telemetry" aria-label={t.overview}>
          <div><dt>{t.statSource}</dt><dd>{sourceCues.length || "—"}</dd></div>
          <div><dt>{t.statCues}</dt><dd>{tidy.length || "—"}</dd></div>
          <div><dt>{t.statDuration}</dt><dd>{sourceCues.length ? formatDuration(subtitleDuration(sourceCues)) : "—"}</dd></div>
          <div className="telemetry-progress"><dt>{t.statDone}</dt><dd>{sourceCues.length ? `${progress}%` : "—"}</dd></div>
        </dl>
        <span className={`signal-status ${progressStatus}`}><i aria-hidden="true" />{sourceCues.length ? progressLabel : t.waiting}</span>
      </header>

      <div className="lab-grid">
        <aside className="rack" aria-label={t.settings}>
          <div className="rack-modules">
            <section className="module">
              <h2><span className="module-index">01</span>{t.importTitle}</h2>
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
                  aria-label={t.chooseFile}
                />
                {sourceCues.length ? (
                  <>
                    <strong title={sourceName} dir="auto">{sourceName}</strong>
                    <div className="file-meta">
                      <span>{format(t.fileMeta, { count: sourceCues.length, duration: formatDuration(subtitleDuration(sourceCues)) })}</span>
                      <button className="ghost-button" type="button" disabled={editing} onClick={() => fileInputRef.current?.click()}>{t.replace}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button className="outline-button" type="button" onClick={() => fileInputRef.current?.click()}>{t.chooseFile}</button>
                    <span>{t.dropHint}</span>
                  </>
                )}
              </div>
              {!sourceCues.length && lastSession && (
                <div className="resume-card">
                  <span>{format(t.lastTask, { time: formatSavedAt(lastSession.savedAt, locale) })}</span>
                  <strong title={lastSession.name} dir="auto">{lastSession.name}</strong>
                  <div className="file-meta">
                    <span>{format(lastSession.hasSource ? t.translatedCount : t.reselect, { count: lastSession.translated })}</span>
                    <span>
                      {lastSession.hasSource && <button className="ghost-button accent" type="button" onClick={resumeLastSession}>{t.resume}</button>}
                      <button className="ghost-button" type="button" onClick={forgetLastSession}>{t.remove}</button>
                    </span>
                  </div>
                </div>
              )}
              {!sourceCues.length && <button className="ghost-button demo-button" type="button" onClick={() => void loadText(SAMPLE_SRT, t.demoFile, false)}>{t.watchDemo}</button>}
            </section>

            <section className="module">
              <h2><span className="module-index">02</span>{t.languagesTitle}</h2>
              <fieldset disabled={editing}>
                <div className="language-pair">
                  <label className="field" htmlFor="source-language">
                    <span className="field-label">{t.sourceLanguage}</span>
                    <select id="source-language" value={sourceLanguage} onChange={(event) => { chooseSource(event.target.value); setDetectedLanguage(""); settingsChanged(); }}>
                      {languageOptions}
                    </select>
                  </label>
                  <span className="pair-arrow" aria-hidden="true">→</span>
                  <label className="field" htmlFor="target-language">
                    <span className="field-label">{t.targetLanguage}</span>
                    <select id="target-language" value={targetLanguage} onChange={(event) => { setTargetLanguage(event.target.value); settingsChanged(); }}>
                      {languageOptions}
                    </select>
                  </label>
                </div>
                {sameLanguage
                  ? <p className="status-message error" role="alert">{t.sameLanguage}</p>
                  : detectedLanguage && <span className="field-hint">{format(t.detected, { language: detectedName })}</span>}
              </fieldset>
            </section>

            <section className="module">
              <h2><span className="module-index">03</span>{t.layoutTitle}</h2>
              <fieldset disabled={editing}>
                <div className="field">
                  <span className="field-label" id="editor-label">{t.editor}</span>
                  <div className="segmented three" role="radiogroup" aria-labelledby="editor-label">
                    {(Object.keys(EDITOR_PROFILES) as Editor[]).map((value) => (
                      <label key={value}><input type="radio" name="editor" value={value} checked={editor === value} onChange={() => setEditor(value)} /><span>{messages.editors[value].short}</span></label>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label" id="frame-label">{t.frame}</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="frame-label">
                    <label><input type="radio" name="frame" value="landscape" checked={frame === "landscape"} onChange={() => { setFrame("landscape"); settingsChanged(); }} /><span>{t.landscape}</span></label>
                    <label><input type="radio" name="frame" value="portrait" checked={frame === "portrait"} onChange={() => { setFrame("portrait"); settingsChanged(); }} /><span>{t.portrait}</span></label>
                  </div>
                </div>
                <div className="field">
                  <span className="field-label" id="order-label">{t.order}</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="order-label">
                    <label><input type="radio" name="order" value="translation-first" checked={order === "translation-first"} onChange={() => setOrder("translation-first")} /><span>{t.translationFirst}</span></label>
                    <label><input type="radio" name="order" value="source-first" checked={order === "source-first"} onChange={() => setOrder("source-first")} /><span>{t.sourceFirst}</span></label>
                  </div>
                </div>
                <p className="rule-note">{t.ruleNote}</p>

                <details className="advanced-settings">
                  <summary>{t.advanced}</summary>
                  <div className="details-content">
                    <label className="field-label slider-label" htmlFor="max-chars">
                      {t.maxChars} <output htmlFor="max-chars">{sourceMaxChars}</output>
                    </label>
                    <input id="max-chars" className="range" type="range" min="48" max="84" step="6" value={maxChars} onChange={(event) => { setMaxChars(Number(event.target.value)); settingsChanged(); }} />
                    <span className="field-hint">{format(t.widthHint, { source: profile.sourceLineChars, target: profile.targetLineChars })}</span>
                    <div className="field">
                      <span className="field-label" id="mode-label">{t.longSentences}</span>
                      <div className="segmented" role="radiogroup" aria-labelledby="mode-label">
                        <label><input type="radio" name="mode" value="new-cue" checked={mode === "new-cue"} onChange={() => { setMode("new-cue"); settingsChanged(); }} /><span>{t.newCue}</span></label>
                        <label><input type="radio" name="mode" value="line-break" checked={mode === "line-break"} onChange={() => { setMode("line-break"); settingsChanged(); }} /><span>{t.lineBreak}</span></label>
                      </div>
                    </div>
                    <label className="field" htmlFor="time-offset">
                      <span className="field-label">{t.offset}</span>
                      <input id="time-offset" type="number" step="0.001" min="-36000" max="36000" value={timeOffsetSeconds} onChange={(event) => setTimeOffsetSeconds(Number(event.target.value) || 0)} />
                    </label>
                    <span className="field-hint">{t.offsetHint}</span>
                  </div>
                </details>
              </fieldset>
              {prepared.error && <p className="status-message error" role="alert">{prepared.error}</p>}
            </section>

            <section className="module">
              <h2><span className="module-index">04</span>{t.engineTitle}<a href={providerConfig.keyUrl} target="_blank" rel="noreferrer">{t.getKey}</a></h2>
              <fieldset disabled={editing}>
                <label className="field" htmlFor="provider">
                  <span className="field-label">{t.provider}</span>
                  <select id="provider" value={provider} onChange={(event) => { setProvider(event.target.value); setKeyAttention(false); }}>
                    {PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDER_CONFIG[id].label}</option>)}
                  </select>
                </label>
                <label className="field" htmlFor="api-key">
                  <span className="field-label">{format(t.apiKey, { provider: providerConfig.label })}</span>
                  <input ref={keyInputRef} id="api-key" className={keyAttention ? "attention" : ""} type="password" autoComplete="off" spellCheck="false" dir="ltr" value={apiKey} placeholder={providerConfig.keyHint} onChange={(event) => { setApiKeys((keys) => ({ ...keys, [provider]: event.target.value })); setKeyAttention(false); }} />
                </label>
                <div className="key-options">
                  <label className="checkbox-field">
                    <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
                    {t.rememberKey}
                  </label>
                  {apiKey && <button className="ghost-button" type="button" onClick={() => { setApiKeys((keys) => ({ ...keys, [provider]: "" })); setRememberKey(false); }}>{t.clearKey}</button>}
                </div>
                <p className="key-note">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="3" y="7" width="10" height="7.5" rx="2" fill="currentColor" /></svg>
                  {format(t.keyNote, { provider: providerConfig.label })}
                </p>
                <label className="field" htmlFor="model">
                  <span className="field-label">{t.model}</span>
                  {providerConfig.strictModels ? (
                    <select id="model" value={model} onChange={(event) => setModels((current) => ({ ...current, [provider]: event.target.value }))}>
                      {providerConfig.models.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  ) : (
                    <input id="model" list="model-options" dir="ltr" spellCheck="false" autoComplete="off" value={models[provider] ?? model} onChange={(event) => setModels((current) => ({ ...current, [provider]: event.target.value }))} />
                  )}
                  <datalist id="model-options">
                    {providerConfig.models.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </label>
                {!providerConfig.strictModels && <span className="field-hint">{t.modelHint}</span>}
                <label className="field" htmlFor="glossary">
                  <span className="field-label">{t.glossary}</span>
                  <textarea id="glossary" rows={3} spellCheck="false" value={glossaryText} placeholder={t.glossaryPlaceholder} onChange={(event) => setGlossaryText(event.target.value)} />
                </label>
                <span className="field-hint">{t.glossaryHint}</span>
              </fieldset>
            </section>

            <details className="module platform-help">
              <summary>{editorText.helpTitle}</summary>
              <div className="details-content">
                <p>{editorText.importHelp}</p>
                <p>{editorText.styleHelp}</p>
                <p>{t.fontNote}</p>
                <a href={profile.sourceUrl} target="_blank" rel="noreferrer">{t.importDocs}</a>{"  "}<a href={profile.styleSourceUrl} target="_blank" rel="noreferrer">{t.styleDocs}</a>
              </div>
            </details>
          </div>

          <div className={`dock ${progressStatus}`} aria-live="polite">
            <div className="dock-readout">
              <strong className="dock-figure">{sourceCues.length ? progress : 0}<small>%</small></strong>
              <div>
                <span className="dock-label">{sourceCues.length ? progressLabel : t.waiting}</span>
                <span className="dock-count">{format(t.doneCount, { done: translatedCount, total: tidy.length })}</span>
              </div>
            </div>
            <div className="meter" role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <i style={{ width: `${progress}%` }} />
            </div>
            {(status !== "done" || translatedCount !== tidy.length) && <div className="task-actions">
              {editing ? (
                <button className="outline-button" type="button" onClick={() => abortRef.current?.abort()}>{t.pause}</button>
              ) : (
                <>
                  <button className="primary-button" type="button" disabled={!tidy.length || translatedCount === tidy.length || sameLanguage} onClick={() => void translate()}>
                    {translatedCount > 0 && translatedCount < tidy.length
                      ? format(t.continueCount, { count: tidy.length - translatedCount })
                      : status === "error" ? t.continue : translatedCount && translatedCount === tidy.length ? t.finished : t.start}
                  </button>
                  {status === "error" && sourceCues.length > 0 && <button className="outline-button" type="button" onClick={() => void translate(true)}>{t.restart}</button>}
                </>
              )}
            </div>}
            {message && (status !== "done" || overlongCount > 0) && <p className={`status-message ${status === "error" ? "error" : ""}`} role={status === "error" ? "alert" : "status"}>{message}</p>}
          </div>
        </aside>

        <section className="bench" aria-label={t.bench}>
          <div className="bench-bar">
            <div className="bench-title">
              <h2>{t.previewTitle}</h2>
              <p>{sourceCues.length ? format(t.summary, { source: sourceCues.length, cues: tidy.length }) : t.previewEmpty}{qualityWarningCount > 0 && format(t.needCheck, { count: qualityWarningCount })}</p>
            </div>
            {tidy.length > 0 && (
              <div className="filters" role="radiogroup" aria-label={t.filters}>
                {([["all", t.filterAll, tidy.length], ["pending", t.filterPending, pendingCount], ["warn", t.filterWarn, qualityWarningCount]] as const).map(([value, label, count]) => (
                  <label key={value} className={value}><input type="radio" name="filter" value={value} checked={filter === value} onChange={() => setFilter(value)} /><span>{label}<b>{count}</b></span></label>
                ))}
              </div>
            )}
            <div className="bench-actions">
              <button className="outline-button" type="button" disabled={!tidy.length} onClick={() => download("source")}>{t.downloadSource}</button>
              <button className="outline-button" type="button" disabled={!tidy.length || translatedCount !== tidy.length} onClick={() => download("translation")}>{t.downloadTranslation}</button>
              <button className="primary-button" type="button" disabled={!tidy.length || translatedCount !== tidy.length} onClick={() => download("bilingual")}>{t.downloadBilingual}</button>
            </div>
          </div>

          {previewCue ? (
            <div className="bench-body" ref={benchBodyRef}>
              <div className="instrument">
                <SignalTrack cues={tidy} stateCodes={stateCodes} activeIndex={activePreviewIndex} label={t.track} onSelect={selectFromTrack} />
                <div className="legend" aria-hidden="true">
                  <span className="done">{t.legendDone}</span><span className="pending">{t.legendPending}</span><span className="warn">{t.legendWarn}</span>
                  <span className="shortcut"><kbd>⌘/Ctrl</kbd>+<kbd>↑↓</kbd> {t.shortcut}</span>
                </div>
                <details className="monitor">
                  <summary>{t.monitor}<span>{format(t.monitorPosition, { index: activePreviewIndex + 1, time: formatTimestamp(previewCue.startMs + timeOffsetSeconds * 1000) })}</span></summary>
                  <div className={`preview-screen ${frame}`}>
                    <div className={`screen-subtitles ${order}`}>
                      {translations[previewCue.id]?.trim() && <p className="screen-chinese" lang={targetLanguage} dir={dirOf(targetLanguage)}>{wrapSubtitle(translations[previewCue.id], profile.targetLineChars, targetLanguage)}</p>}
                      <p className="screen-english" lang={sourceLanguage} dir={dirOf(sourceLanguage)}>{previewCue.text}</p>
                    </div>
                  </div>
                  <div className="preview-navigation">
                    <button className="ghost-button" type="button" disabled={activePreviewIndex === 0} onClick={() => setPreviewIndex(activePreviewIndex - 1)}>{t.previous}</button>
                    <span>{activePreviewIndex + 1} / {tidy.length}</span>
                    <button className="ghost-button" type="button" disabled={activePreviewIndex === tidy.length - 1} onClick={() => setPreviewIndex(activePreviewIndex + 1)}>{t.next}</button>
                  </div>
                  <p className="field-hint preview-hint">{t.previewHint}</p>
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
                    targetLineChars={profile.targetLineChars}
                    sourceLanguage={sourceLanguage}
                    targetLanguage={targetLanguage}
                    placeholder={status === "done" ? t.placeholderEdit : t.placeholder}
                    t={t}
                    onEdit={updateTranslation}
                    onSelect={setPreviewIndex}
                    onNavigate={navigateFrom}
                  />
                ))}
                {!rows.length && <p className="list-empty">{filter === "pending" ? t.noPending : t.noWarn}</p>}
              </div>
            </div>
          ) : (
            <div className="empty-bench">
              <LogoMark className="hero-mark" />
              <p>{t.dropTitle}</p>
              <span>{t.dropBody}</span>
              <div className="hero-actions">
                <button className="primary-button" type="button" disabled={editing} onClick={() => fileInputRef.current?.click()}>{t.chooseFile}</button>
                <button className="ghost-button" type="button" data-demo onClick={() => void loadText(SAMPLE_SRT, t.demoFile, false)}>{t.demoButton}</button>
              </div>
            </div>
          )}
        </section>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
