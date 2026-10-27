import { Wordmark } from "./logo-mark";

const REPO = "https://github.com/guanzun9-oss/bilingual-subtitle-studio";

export function SiteNav() {
  return (
    <header className="site-nav">
      <a className="brand" href="#top" aria-label="Cuewise 字幕匠 首页">
        <Wordmark />
      </a>
      <nav aria-label="页面导航">
        <a href="#why">设计原则</a>
        <a href="#how">工作流程</a>
        <a href="#faq">常见问题</a>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <a className="nav-cta" href="#studio">开始制作</a>
    </header>
  );
}

// Real output: the demo cue below, split and timed by lib/srt-core.mjs with default settings.
const RAW_CUE = {
  index: 1,
  time: "00:00:01,000 --> 00:00:08,600",
  text: "When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.",
};
const OUTPUT_CUES = [
  { time: "00:00:01,000 --> 00:00:03,082", zh: "我们刚开始做这个项目时，以为", en: "When we started this project, we thought" },
  { time: "00:00:03,082 --> 00:00:05,268", zh: "最难的会是技术，", en: "the hardest part would be the technology," },
  { time: "00:00:05,268 --> 00:00:08,600", zh: "结果最难的是理解大家真正需要什么。", en: "but it turned out to be understanding\nwhat people truly needed." },
];

export function Hero() {
  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">为字幕剪辑而生的双语翻译工具</p>
      <h1 id="hero-title">让每一条字幕，都恰到好处。</h1>
      <p className="hero-lead">
        Cuewise 将 Buzz 识别的英文字幕整理为自然断句、逐条对齐的中英双语 SRT。<br />
        时间轴与原字幕分毫不差，导入达芬奇与 Premiere Pro 即可使用。
      </p>
      <div className="hero-actions">
        <a className="primary-button" href="#studio">开始制作</a>
        <a className="text-link" href="#demo">观看演示 ›</a>
      </div>
      <p className="hero-meta">免费使用 · 无需注册 · 演示无需 API Key</p>

      <figure className="before-after" aria-label="同一条字幕处理前后对比">
        <div className="srt-pane">
          <p className="pane-label">原始字幕 · Buzz 导出</p>
          <pre className="srt-text"><span className="srt-meta">{RAW_CUE.index}{"\n"}{RAW_CUE.time}</span>{"\n"}{RAW_CUE.text}</pre>
          <p className="pane-note">单条 7.6 秒，整句堆叠在一起，难以阅读</p>
        </div>
        <span className="pane-arrow" aria-hidden="true">→</span>
        <div className="srt-pane result">
          <p className="pane-label">Cuewise 输出 · 中英双语</p>
          <pre className="srt-text">
            {OUTPUT_CUES.map((cue, index) => (
              <span key={cue.time} className="srt-cue">
                <span className="srt-meta">{RAW_CUE.index + index}{"\n"}{cue.time}</span>{"\n"}
                <b>{cue.zh}</b>{"\n"}{cue.en}
              </span>
            ))}
          </pre>
          <p className="pane-note">在语义停顿处拆分为 3 条，首尾时间与原字幕完全一致</p>
        </div>
      </figure>
    </section>
  );
}

const PRINCIPLES = [
  {
    topic: "时间轴",
    usual: "为了方便翻译而合并相邻字幕，时间轴随之改变，与口型和画面错位。",
    here: "严格保留原始条目，只拆分、不合并。拆分点落在句末或语义停顿处，新条目的时间始终位于原条目之内。",
  },
  {
    topic: "语义对齐",
    usual: "整段翻译后再按行数切回，下一句的含义被提前带入上一条字幕。",
    here: "逐条翻译，仅以所属原条目作为语境。遗漏的条目单独补译；偏长的译文只作提示，绝不丢弃。",
  },
  {
    topic: "译名一致",
    usual: "分批翻译后，同一人名或术语在全片出现多种译法，只能逐条排查替换。",
    here: "通过人名与术语表锁定译法，例如 Zane = 赞恩，每一批翻译都严格遵循。",
  },
];

export function Why() {
  return (
    <section id="why" className="site-section" aria-labelledby="why-title">
      <p className="eyebrow">设计原则</p>
      <h2 id="why-title">专业字幕的三条底线。</h2>
      <div className="problem-list">
        {PRINCIPLES.map((item) => (
          <article key={item.topic} className="problem">
            <h3>{item.topic}</h3>
            <div>
              <p className="problem-usual"><span>常见做法</span>{item.usual}</p>
              <p className="problem-here"><span>Cuewise 的做法</span>{item.here}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "导入",
    body: "导入 Buzz 导出的英文 SRT，选择目标剪辑软件与画幅，断句与排版即时完成。",
  },
  {
    title: "翻译与校对",
    body: "使用你自己的 DeepSeek API Key 多批并行翻译。借助「需检查」筛选与字幕轨道图定位问题条目，以 ⌘/Ctrl + ↑↓ 逐条精修。",
  },
  {
    title: "导出",
    body: "导出 UTF-8 BOM 编码的中英双语 SRT，直接导入达芬奇媒体池或 Premiere Pro 字幕轨道。",
  },
];

export function Steps() {
  return (
    <section id="how" className="site-section how" aria-labelledby="how-title">
      <div className="how-head">
        <p className="eyebrow">工作流程</p>
        <h2 id="how-title">三步，从识别稿到成片字幕。</h2>
        <p className="how-lead">无需安装与注册，在浏览器中即可完成全部流程。</p>
      </div>
      <ol className="steps">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span>{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const QUESTIONS = [
  {
    question: "使用 Cuewise 需要付费吗？",
    answer: "Cuewise 本身完全免费。翻译通过你自己的 DeepSeek 账户调用，按 DeepSeek 官方价格计费，费用取决于台词量与所选模型。",
  },
  {
    question: "导入剪辑软件后，中英文如何排版？",
    answer: "每条字幕导出为中文、英文各一行，仅在超出行宽时换行，并可选择中文或英文在上。字体、字号、描边与位置，请在达芬奇的字幕轨道检查器或 Premiere Pro 的轨道样式中统一设置。",
  },
  {
    question: "我的字幕与 API Key 是否安全？",
    answer: "字幕原文与翻译进度仅保存在你的浏览器中。翻译时，字幕文本与 API Key 经由本站服务器转发至 DeepSeek，本站不做任何保存。API Key 默认不会被记住；勾选「记住」后仅存于本机浏览器，并可随时一键清除。",
  },
  {
    question: "翻译中断后如何继续？",
    answer: "已完成的译文会被完整保留。点击「继续任务」即可从中断处恢复；即使关闭页面，下次打开时也可以从「上次的任务」继续。",
  },
  {
    question: "导出的字幕可以直接交付吗？",
    answer: "Cuewise 基于文本进行断句与翻译，无法感知画面与声音。建议导入剪辑软件后对照视频完整审看，再行交付。",
  },
];

export function Faq() {
  return (
    <section id="faq" className="site-section faq" aria-labelledby="faq-title">
      <p className="eyebrow">常见问题</p>
      <h2 id="faq-title">你可能想了解的。</h2>
      <div className="faq-list">
        {QUESTIONS.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-row">
        <div className="footer-brand">
          <a className="brand" href="#top" aria-label="Cuewise 字幕匠 首页">
            <Wordmark />
          </a>
          <p>为字幕剪辑而生的双语翻译工具。</p>
        </div>
        <nav aria-label="项目链接">
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">更新日志</a>
          <a href={`${REPO}/blob/main/docs/subtitle-rules.md`} target="_blank" rel="noreferrer">字幕规则与来源</a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">问题反馈</a>
        </nav>
      </div>
      <p className="footer-legal">
        © 2026 Cuewise 字幕匠。字幕原文与翻译进度仅保存在你的浏览器中；翻译请求经本站转发至 DeepSeek，本站不做保存。
      </p>
    </footer>
  );
}
