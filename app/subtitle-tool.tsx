"use client";

import { useMemo, useRef, useState } from "react";
import {
  formatTimestamp,
  parseSrt,
  serializeSrt,
  subtitleDuration,
  tidyCues,
} from "@/lib/srt-core.mjs";

type Cue = {
  id: string;
  sourceId: string;
  startMs: number;
  endMs: number;
  text: string;
};

type Mode = "new-cue" | "line-break";
type Order = "chinese-first" | "english-first";

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:08,600
When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.

2
00:00:09,100 --> 00:00:14,800
That changed everything, and it gave us a much clearer direction for the future.`;

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function batch<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function sanitizeFileName(name: string) {
  return name.replace(/\.srt$/i, "").replace(/[\\/:*?"<>|]/g, "-");
}

export default function SubtitleTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceCues, setSourceCues] = useState<Cue[]>([]);
  const [maxChars, setMaxChars] = useState(48);
  const [mode, setMode] = useState<Mode>("new-cue");
  const [order, setOrder] = useState<Order>("chinese-first");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "ready" | "translating" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  const tidy = useMemo(
    () => tidyCues(sourceCues, { maxChars, mode }) as Cue[],
    [sourceCues, maxChars, mode],
  );

  const translatedCount = useMemo(
    () => tidy.filter((cue) => translations[cue.id]).length,
    [tidy, translations],
  );

  function resetOutput() {
    setTranslations({});
    setProgress(0);
    setMessage("");
    setStatus(sourceCues.length ? "ready" : "idle");
  }

  async function loadText(text: string, name: string) {
    try {
      const cues = parseSrt(text) as Cue[];
      setSourceName(name);
      setSourceCues(cues);
      setTranslations({});
      setProgress(0);
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

  async function translate() {
    if (!sourceCues.length) {
      setStatus("error");
      setMessage("请先导入英文 SRT 文件。");
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
    setProgress(0);
    setTranslations({});

    try {
      const groups = batch(tidy, 40);
      const nextTranslations: Record<string, string> = {};

      for (let index = 0; index < groups.length; index += 1) {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            model,
            items: groups[index].map((cue) => ({
              id: cue.id,
              text: cue.text.replace(/\n/g, " "),
            })),
          }),
        });

        const data = (await response.json()) as {
          error?: string;
          translations?: Record<string, string>;
        };
        if (!response.ok || !data.translations) {
          throw new Error(data.error || "翻译失败，请稍后重试。");
        }

        Object.assign(nextTranslations, data.translations);
        setTranslations({ ...nextTranslations });
        setProgress(Math.round(((index + 1) / groups.length) * 100));
      }

      setStatus("done");
      setMessage("翻译完成，可以检查预览并下载。");
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("ready");
        setMessage("已停止翻译。");
      } else {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "翻译失败。");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function updateTranslation(id: string, value: string) {
    setTranslations((current) => ({ ...current, [id]: value }));
  }

  function download(bilingual = true) {
    if (bilingual && translatedCount !== tidy.length) {
      setStatus("error");
      setMessage("还有字幕尚未翻译完成。");
      return;
    }

    const content = serializeSrt(tidy, translations, {
      order,
      bilingual,
      includeBom: true,
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFileName(sourceName || "subtitle")}.${
      bilingual ? "中英双语" : "已整理英文"
    }.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="双语字幕工坊首页">
          <span className="brand-mark" aria-hidden="true">
            A<span>译</span>
          </span>
          <span>
            双语字幕工坊
            <small>SRT BILINGUAL STUDIO</small>
          </span>
        </a>
        <div className="header-note">
          <span className="privacy-dot" />
          API Key 仅用于当次翻译
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">
          <span>BUZZ 字幕整理助手</span>
          <i />
          英译中
        </div>
        <h1>
          让每一句字幕，
          <em>刚刚好。</em>
        </h1>
        <p>
          导入英文 SRT，自动在句号、逗号或自然语义处拆分，
          再用 DeepSeek 生成对齐的中英双语字幕。
        </p>
      </section>

      <nav className="steps" aria-label="制作步骤">
        {[
          ["01", "导入字幕"],
          ["02", "整理断句"],
          ["03", "翻译导出"],
        ].map(([number, label], index) => (
          <div
            className={`step ${
              sourceCues.length && index < 2
                ? "active"
                : status === "done" && index === 2
                  ? "active"
                  : ""
            }`}
            key={number}
          >
            <span>{number}</span>
            {label}
          </div>
        ))}
      </nav>

      <section className="workspace">
        <div className="panel import-panel">
          <div className="panel-heading">
            <span className="panel-number">01</span>
            <div>
              <h2>导入英文字幕</h2>
              <p>支持 Buzz 导出的标准 SRT，文件不会被保存。</p>
            </div>
          </div>

          <div
            className={`drop-zone ${dragging ? "dragging" : ""} ${
              sourceCues.length ? "has-file" : ""
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void loadFile(event.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,application/x-subrip,text/plain"
              onChange={(event) => void loadFile(event.target.files?.[0])}
              aria-label="选择 SRT 文件"
            />
            <div className="upload-icon" aria-hidden="true">
              ↑
            </div>
            {sourceCues.length ? (
              <>
                <strong>{sourceName}</strong>
                <span>
                  {sourceCues.length} 条原字幕 ·{" "}
                  {formatDuration(subtitleDuration(sourceCues))}
                </span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  更换文件
                </button>
              </>
            ) : (
              <>
                <strong>拖入 SRT 文件</strong>
                <span>或点击选择文件，最大 4 MB</span>
                <div className="drop-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void loadText(SAMPLE_SRT, "演示字幕.srt")}
                  >
                    载入演示
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={`panel settings-panel ${!sourceCues.length ? "muted" : ""}`}>
          <div className="panel-heading">
            <span className="panel-number coral">02</span>
            <div>
              <h2>整理断句</h2>
              <p>设置每条字幕的理想长度与呈现方式。</p>
            </div>
          </div>

          <fieldset disabled={!sourceCues.length || status === "translating"}>
            <label className="control-label" htmlFor="max-chars">
              每条英文最多字符
              <output htmlFor="max-chars">{maxChars}</output>
            </label>
            <input
              id="max-chars"
              className="range"
              type="range"
              min="28"
              max="80"
              step="2"
              value={maxChars}
              onChange={(event) => {
                setMaxChars(Number(event.target.value));
                resetOutput();
              }}
            />
            <div className="range-labels">
              <span>更短，更易读</span>
              <span>更长，条目更少</span>
            </div>

            <div className="control-group">
              <span className="control-label">长句处理方式</span>
              <label className={`choice ${mode === "new-cue" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="mode"
                  value="new-cue"
                  checked={mode === "new-cue"}
                  onChange={() => {
                    setMode("new-cue");
                    resetOutput();
                  }}
                />
                <span>
                  <b>拆成下一条字幕</b>
                  <small>按文字比例自动分配原时间段</small>
                </span>
                <i>推荐</i>
              </label>
              <label
                className={`choice ${mode === "line-break" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="line-break"
                  checked={mode === "line-break"}
                  onChange={() => {
                    setMode("line-break");
                    resetOutput();
                  }}
                />
                <span>
                  <b>在原字幕内换行</b>
                  <small>完全保留现有时间条目</small>
                </span>
              </label>
            </div>

            <div className="result-strip">
              <div>
                <span>整理前</span>
                <strong>{sourceCues.length || "—"}</strong>
                <small>条</small>
              </div>
              <span className="result-arrow">→</span>
              <div>
                <span>整理后</span>
                <strong>{tidy.length || "—"}</strong>
                <small>条</small>
              </div>
              <div className="natural-tag">优先自然标点</div>
            </div>
          </fieldset>
        </div>

        <div className={`panel translate-panel ${!sourceCues.length ? "muted" : ""}`}>
          <div className="panel-heading">
            <span className="panel-number ink">03</span>
            <div>
              <h2>DeepSeek 翻译</h2>
              <p>分批翻译，保持每条中英文严格对应。</p>
            </div>
          </div>

          <fieldset disabled={!sourceCues.length || status === "translating"}>
            <label className="control-label" htmlFor="api-key">
              DeepSeek API Key
              <span className="safe-label">不保存</span>
            </label>
            <div className="key-input">
              <span aria-hidden="true">●</span>
              <input
                id="api-key"
                type="password"
                autoComplete="off"
                spellCheck="false"
                value={apiKey}
                placeholder="sk-..."
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>

            <div className="two-columns">
              <label>
                <span className="control-label">翻译模型</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  <option value="deepseek-v4-flash">V4 Flash · 快速省钱</option>
                  <option value="deepseek-v4-pro">V4 Pro · 质量优先</option>
                </select>
              </label>
              <label>
                <span className="control-label">双语顺序</span>
                <select
                  value={order}
                  onChange={(event) => setOrder(event.target.value as Order)}
                >
                  <option value="chinese-first">中文在上 / 英文在下</option>
                  <option value="english-first">英文在上 / 中文在下</option>
                </select>
              </label>
            </div>
          </fieldset>

          {status === "translating" ? (
            <div className="progress-box" aria-live="polite">
              <div>
                <span>正在翻译与校准…</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => abortRef.current?.abort()}
              >
                停止
              </button>
            </div>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={!sourceCues.length}
              onClick={() => void translate()}
            >
              <span>开始制作双语字幕</span>
              <b>→</b>
            </button>
          )}

          {message && (
            <p
              className={`status-message ${status === "error" ? "error" : ""}`}
              role={status === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </div>
      </section>

      {sourceCues.length > 0 && (
        <section className="preview-section">
          <div className="preview-heading">
            <div>
              <span className="section-kicker">实时预览</span>
              <h2>字幕会这样呈现</h2>
            </div>
            <div className="preview-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => download(false)}
              >
                下载已整理英文
              </button>
              <button
                className="download-button"
                type="button"
                disabled={translatedCount !== tidy.length}
                onClick={() => download(true)}
              >
                下载中英双语 SRT
                <span>↓</span>
              </button>
            </div>
          </div>

          <div className="subtitle-list">
            {tidy.slice(0, 12).map((cue, index) => (
              <article className="subtitle-row" key={cue.id}>
                <div className="cue-number">{String(index + 1).padStart(2, "0")}</div>
                <time>
                  {formatTimestamp(cue.startMs)}
                  <span>→</span>
                  {formatTimestamp(cue.endMs)}
                </time>
                <div className={`subtitle-copy ${order}`}>
                  {order === "chinese-first" && (
                    <textarea
                      aria-label={`第 ${index + 1} 条中文字幕`}
                      value={translations[cue.id] || ""}
                      onChange={(event) =>
                        updateTranslation(cue.id, event.target.value)
                      }
                      placeholder={
                        status === "done" ? "点击修改译文" : "翻译后显示中文"
                      }
                      rows={1}
                    />
                  )}
                  <p>{cue.text}</p>
                  {order === "english-first" && (
                    <textarea
                      aria-label={`第 ${index + 1} 条中文字幕`}
                      value={translations[cue.id] || ""}
                      onChange={(event) =>
                        updateTranslation(cue.id, event.target.value)
                      }
                      placeholder={
                        status === "done" ? "点击修改译文" : "翻译后显示中文"
                      }
                      rows={1}
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
          {tidy.length > 12 && (
            <p className="preview-more">
              预览前 12 条，下载文件将包含全部 {tidy.length} 条字幕。
            </p>
          )}
        </section>
      )}

      <footer>
        <span>双语字幕工坊</span>
        <p>本工具不保存字幕内容或 API Key。翻译请求由 DeepSeek 处理。</p>
      </footer>
    </main>
  );
}
