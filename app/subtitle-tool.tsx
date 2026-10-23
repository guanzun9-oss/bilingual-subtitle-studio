"use client";

import { useMemo, useRef, useState } from "react";
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
import { EDITOR_PROFILES, getSubtitleProfile } from "@/lib/subtitle-profiles.mjs";
import { translateInBatches } from "@/lib/translation-queue.mjs";

type Cue = {
  id: string;
  sourceId: string;
  startMs: number;
  endMs: number;
  text: string;
  contextText?: string;
};

type Mode = "new-cue" | "line-break";
type Order = "chinese-first" | "english-first";

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:08,600
When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.

2
00:00:09,100 --> 00:00:14,800
That changed everything. What should we do next? Let's find out!`;

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeFileName(name: string) {
  return name.replace(/\.srt$/i, "").replace(/[\\/:*?"<>|]/g, "-");
}

function maxChineseChars(cue: Cue, lineChars = 16) {
  return Math.max(
    8,
    Math.min(lineChars * 2, Math.floor(((cue.endMs - cue.startMs) / 1000) * 9)),
  );
}

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
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "ready" | "translating" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

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
  const activePreviewIndex = Math.min(previewIndex, Math.max(0, tidy.length - 1));
  const previewCue = tidy[activePreviewIndex];
  const cueWarnings = useMemo(
    () => Object.fromEntries(tidy.map((cue) => [cue.id, getSubtitleWarnings(cue, translations[cue.id] || "", profile)])),
    [tidy, translations, profile],
  );
  const qualityWarningCount = Object.values(cueWarnings).filter((warnings) => warnings.length > 0).length;

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

  const progressLabel =
    status === "done"
      ? "制作完成"
      : status === "translating"
        ? "正在翻译与校准…"
        : status === "error"
          ? "任务中断，当前进度已保留"
          : translatedCount
            ? "任务已暂停，可以继续"
            : "制作进度";

  function resetOutput() {
    setTranslations({});
    setMessage("");
    setStatus(sourceCues.length ? "ready" : "idle");
  }

  async function loadText(text: string, name: string) {
    try {
      const cues = parseSrt(text) as Cue[];
      setSourceName(name);
      setSourceCues(cues);
      setPreviewIndex(0);
      setTranslations({});
      setStatus("ready");
      setMessage("");
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
      setMessage("请填写 DeepSeek API Key。");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("translating");
    setMessage("");
    const validIds = new Set(tidy.map((cue) => cue.id));
    const cuesById = new Map(tidy.map((cue) => [cue.id, cue]));
    const nextTranslations: Record<string, string> = restart
      ? {}
      : Object.fromEntries(
          Object.entries(translations).filter(
            ([id, text]) => cuesById.has(id) && text.trim(),
          ),
        );
    if (restart) setTranslations({});
    const pending = tidy.filter((cue) => !nextTranslations[cue.id]?.trim());

    try {
      if (!pending.length) {
        setStatus("done");
        setMessage("全部字幕已经翻译完成。");
        return;
      }

      const lineChars = profile.chineseLineChars;
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
              items: group.map((cue) => ({
                id: cue.id,
                text: cue.text.replace(/\n/g, " "),
                context: (cue.contextText || cue.text).replace(/\n/g, " "),
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
            setTranslations({ ...nextTranslations });
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
        const finished = Object.keys(nextTranslations).filter((id) =>
          validIds.has(id),
        ).length;
        const detail = error instanceof Error ? error.message : "翻译失败。";
        setMessage(
          `${detail} 已保留完成的 ${finished} 条，点击按钮可从这里继续。`,
        );
      }
    } finally {
      abortRef.current = null;
    }
  }

  function updateTranslation(id: string, value: string) {
    setTranslations((current) => ({ ...current, [id]: value }));
  }

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
    anchor.download = `${sanitizeFileName(sourceName || "subtitle")}.${
      bilingual ? "中英双语" : "已整理英文"
    }.${profile.suffix}.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
    if (bilingual && overlongCount) {
      setStatus("done");
      setMessage(`已导出；其中 ${overlongCount} 条偏长，建议播放时重点检查。`);
    }
  }

  return (
    <main id="top">
      <header className="site-header">
        <h1>双语字幕工坊</h1>
        <span>Buzz SRT → 中英双语</span>
      </header>

      <div className="workspace">
        <aside className="controls-panel" aria-label="字幕制作设置">
          <section className="control-section import-panel">
            <h2>导入字幕</h2>
            <div
              className={`drop-zone ${dragging ? "dragging" : ""} ${sourceCues.length ? "has-file" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (status !== "translating") void loadFile(event.dataTransfer.files[0]);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,application/x-subrip,text/plain"
                disabled={status === "translating"}
                onChange={(event) => void loadFile(event.target.files?.[0])}
                aria-label="选择 SRT 文件"
              />
              {sourceCues.length ? (
                <>
                  <strong title={sourceName}>{sourceName}</strong>
                  <div className="file-meta">
                    <span>{sourceCues.length} 条 · {formatDuration(subtitleDuration(sourceCues))}</span>
                    <button className="text-button" type="button" disabled={status === "translating"} onClick={() => fileInputRef.current?.click()}>更换</button>
                  </div>
                </>
              ) : (
                <>
                  <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>选择 SRT 文件</button>
                  <span>或拖到这里 · 最大 4 MB</span>
                </>
              )}
            </div>
            {!sourceCues.length && <button className="text-button demo-button" type="button" onClick={() => void loadText(SAMPLE_SRT, "演示字幕.srt")}>试用演示字幕</button>}
          </section>

          <section className="control-section settings-panel">
            <h2>字幕设置</h2>
            <fieldset disabled={status === "translating"}>
              <label className="field" htmlFor="editor">
                <span>导入平台</span>
                <select id="editor" aria-label="最终导入平台" value={editor} onChange={(event) => setEditor(event.target.value)}>
                  {Object.entries(EDITOR_PROFILES).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                </select>
              </label>
              <div className="two-columns">
                <label className="field" htmlFor="frame">
                  <span>画幅</span>
                  <select id="frame" aria-label="视频画幅" value={frame} onChange={(event) => { setFrame(event.target.value); resetOutput(); }}>
                    <option value="landscape">横屏 16:9</option>
                    <option value="portrait">竖屏 9:16</option>
                  </select>
                </label>
                <label className="field" htmlFor="order">
                  <span>双语顺序</span>
                  <select id="order" value={order} onChange={(event) => setOrder(event.target.value as Order)}>
                    <option value="chinese-first">中文在上</option>
                    <option value="english-first">英文在上</option>
                  </select>
                </label>
              </div>
              <p className="rule-note">只拆分，不合并。句末另起一条，短句单行。</p>

              <details className="advanced-settings">
                <summary>高级设置</summary>
                <div className="details-content">
                  <label className="control-label" htmlFor="max-chars">
                    每条英文长度 <output htmlFor="max-chars">{maxChars}</output>
                  </label>
                  <input id="max-chars" className="range" type="range" min="48" max="84" step="6" value={maxChars} onChange={(event) => { setMaxChars(Number(event.target.value)); resetOutput(); }} />
                  <span className="field-hint">每行英文约 {profile.englishLineChars} 字符，中文约 {profile.chineseLineChars} 字</span>
                  <div className="mode-options" role="group" aria-label="长句处理方式">
                    <label><input type="radio" name="mode" value="new-cue" checked={mode === "new-cue"} onChange={() => { setMode("new-cue"); resetOutput(); }} />超长句拆成新条目</label>
                    <label><input type="radio" name="mode" value="line-break" checked={mode === "line-break"} onChange={() => { setMode("line-break"); resetOutput(); }} />超长句仅换行</label>
                  </div>
                  <label className="field" htmlFor="model">
                    <span>翻译模型</span>
                    <select id="model" value={model} onChange={(event) => setModel(event.target.value)}>
                      <option value="deepseek-v4-flash">V4 Flash · 快速</option>
                      <option value="deepseek-v4-pro">V4 Pro · 质量优先</option>
                    </select>
                  </label>
                  <label className="field" htmlFor="time-offset">
                    <span>导出整体时间偏移（秒）</span>
                    <input id="time-offset" type="number" step="0.001" min="-36000" max="36000" value={timeOffsetSeconds} onChange={(event) => setTimeOffsetSeconds(Number(event.target.value) || 0)} />
                  </label>
                  <span className="field-hint">默认 0，仅在视频时间线需要偏移时调整。</span>
                </div>
              </details>
            </fieldset>
            {prepared.error && <p className="status-message error" role="alert">{prepared.error}</p>}
          </section>

          <section className="control-section translate-panel">
            <div className="section-heading">
              <h2>翻译</h2>
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">获取 Key</a>
            </div>
            <fieldset disabled={status === "translating"}>
              <label className="field" htmlFor="api-key">
                <span>DeepSeek API Key</span>
                <input id="api-key" type="password" autoComplete="off" spellCheck="false" value={apiKey} placeholder="sk-…" onChange={(event) => setApiKey(event.target.value)} />
              </label>
            </fieldset>
            {sourceCues.length > 0 && (
              <div className={`progress-box ${status}`} aria-live="polite">
                <div className="progress-heading"><span>{progressLabel}</span><span>已完成 {translatedCount}/{tidy.length}</span></div>
                <div className="progress-track" role="progressbar" aria-label="双语字幕制作进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {(status !== "done" || translatedCount !== tidy.length) && <div className="task-actions">
              {status === "translating" ? (
                <button className="secondary-button" type="button" onClick={() => abortRef.current?.abort()}>暂停任务</button>
              ) : (
                <>
                  <button className="primary-button" type="button" disabled={!tidy.length || translatedCount === tidy.length} onClick={() => void translate()}>
                    {translatedCount > 0 && translatedCount < tidy.length
                      ? `继续任务 · ${tidy.length - translatedCount} 条`
                      : status === "error" ? "继续任务" : translatedCount && translatedCount === tidy.length ? "翻译完成" : "开始翻译"}
                  </button>
                  {status === "error" && sourceCues.length > 0 && <button className="secondary-button" type="button" onClick={() => void translate(true)}>重新开始</button>}
                </>
              )}
            </div>}
            {message && (status !== "done" || overlongCount > 0) && <p className={`status-message ${status === "error" ? "error" : ""}`} role={status === "error" ? "alert" : "status"}>{message}</p>}
          </section>

          <details className="platform-help">
            <summary>导入 {editor === "resolve" ? "达芬奇" : editor === "premiere" ? "PR" : "剪辑软件"} 的方法</summary>
            <div className="details-content">
              <p>{profile.importHelp}</p>
              <p>{profile.styleHelp}</p>
              <p>字体、字号和位置在剪辑软件内设置。</p>
              <a href={profile.sourceUrl} target="_blank" rel="noreferrer">导入说明</a>{" · "}<a href={profile.styleSourceUrl} target="_blank" rel="noreferrer">样式说明</a>
            </div>
          </details>
        </aside>

        <section className="preview-section" aria-label="字幕预览与下载">
          <div className="preview-heading">
            <div>
              <h2>字幕预览</h2>
              <p className="preview-summary">{sourceCues.length ? `${sourceCues.length} 条原字幕 → ${tidy.length} 条` : "导入后可校对、翻译和下载"}{qualityWarningCount > 0 && ` · ${qualityWarningCount} 条需检查`}</p>
            </div>
            <div className="preview-actions">
              <button className="secondary-button" type="button" disabled={!tidy.length} onClick={() => download(false)}>下载英文</button>
              <button className="download-button" type="button" disabled={!tidy.length || translatedCount !== tidy.length} onClick={() => download(true)}>下载双语 SRT</button>
            </div>
          </div>

          {previewCue ? (
            <>
              <details className="output-preview">
                <summary>画面预览<span>第 {activePreviewIndex + 1} 条</span></summary>
                <div className={`preview-screen ${frame}`}>
                  <div className={`screen-subtitles ${order}`}>
                    {translations[previewCue.id]?.trim() && <p className="screen-chinese">{wrapChineseSubtitle(translations[previewCue.id], profile.chineseLineChars)}</p>}
                    <p className="screen-english">{previewCue.text}</p>
                  </div>
                </div>
                <div className="preview-navigation">
                  <button className="text-button" type="button" disabled={activePreviewIndex === 0} onClick={() => setPreviewIndex(activePreviewIndex - 1)}>上一条</button>
                  <span>{activePreviewIndex + 1} / {tidy.length}</span>
                  <button className="text-button" type="button" disabled={activePreviewIndex === tidy.length - 1} onClick={() => setPreviewIndex(activePreviewIndex + 1)}>下一条</button>
                </div>
                <p className="field-hint preview-hint">排版模拟，最终显示以剪辑软件内的样式为准。</p>
              </details>
              <div className="subtitle-list">
                {tidy.map((cue, index) => (
                  <article className="subtitle-row" key={cue.id}>
                    <button className="cue-number text-button" type="button" aria-label={`预览第 ${index + 1} 条字幕`} aria-pressed={activePreviewIndex === index} onClick={() => setPreviewIndex(index)}>{String(index + 1).padStart(2, "0")}</button>
                    <time>{formatTimestamp(cue.startMs + timeOffsetSeconds * 1000)}<span>→</span>{formatTimestamp(cue.endMs + timeOffsetSeconds * 1000)}</time>
                    <div className={`subtitle-copy ${order}`}>
                      <textarea
                        aria-label={`第 ${index + 1} 条中文字幕`}
                        value={translations[cue.id] || ""}
                        onChange={(event) => updateTranslation(cue.id, event.target.value)}
                        placeholder={status === "done" ? "编辑译文" : "中文译文"}
                        rows={Math.max(1, wrapChineseSubtitle(translations[cue.id] || "", profile.chineseLineChars).split("\n").length)}
                      />
                      <p>{cue.text}</p>
                    </div>
                    {cueWarnings[cue.id]?.length > 0 && <details className="cue-quality"><summary>需检查</summary><p>{cueWarnings[cue.id].join(" · ")}</p></details>}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-preview"><p>先导入英文字幕</p><span>支持 Buzz 导出的 SRT 文件</span></div>
          )}
        </section>
      </div>
      <footer>字幕和 API Key 不保存；翻译由 DeepSeek 处理。</footer>
    </main>
  );
}
