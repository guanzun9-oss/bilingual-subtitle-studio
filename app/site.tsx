import LogoMark from "./logo-mark";

const REPO = "https://github.com/guanzun9-oss/bilingual-subtitle-studio";

export function SiteNav() {
  return (
    <header className="site-nav">
      <a className="brand" href="#top" aria-label="双语字幕工坊 首页">
        <LogoMark />
        <strong>双语字幕工坊</strong>
      </a>
      <nav aria-label="页面导航">
        <a href="#why">为什么</a>
        <a href="#how">使用方法</a>
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
      <p className="eyebrow">Buzz 英文 SRT → 中英双语 SRT</p>
      <h1 id="hero-title">英文字幕，一步变双语。</h1>
      <p className="hero-lead">
        把 Buzz 识别出的英文字幕拖进来：按句拆条，时间轴不越界，逐条译成中文。<br />
        导出后直接放进达芬奇或 Premiere 的字幕轨。
      </p>
      <div className="hero-actions">
        <a className="primary-button" href="#studio">开始制作</a>
        <a className="text-link" href="#demo">先看演示，不用 Key ›</a>
      </div>

      <figure className="before-after" aria-label="同一条字幕处理前后对比">
        <div className="srt-pane">
          <p className="pane-label">Buzz 导出的原字幕</p>
          <pre className="srt-text"><span className="srt-meta">{RAW_CUE.index}{"\n"}{RAW_CUE.time}</span>{"\n"}{RAW_CUE.text}</pre>
          <p className="pane-note">一条 7.6 秒，一整句长话挤在一起</p>
        </div>
        <span className="pane-arrow" aria-hidden="true">→</span>
        <div className="srt-pane result">
          <p className="pane-label">导出的双语 SRT</p>
          <pre className="srt-text">
            {OUTPUT_CUES.map((cue, index) => (
              <span key={cue.time} className="srt-cue">
                <span className="srt-meta">{RAW_CUE.index + index}{"\n"}{cue.time}</span>{"\n"}
                <b>{cue.zh}</b>{"\n"}{cue.en}
              </span>
            ))}
          </pre>
          <p className="pane-note">在自然停顿处拆成 3 条，首尾时间仍是 00:01,000 与 00:08,600</p>
        </div>
      </figure>
    </section>
  );
}

const PROBLEMS = [
  {
    topic: "断句",
    usual: "相邻的短条被合并成整句再翻译，时间轴跟着变，导入后和口型对不上。",
    here: "Buzz 原条目只拆不合。句号、问号后另起一条，拆出的时间落在原条目之内，首尾时间不变。",
  },
  {
    topic: "对齐",
    usual: "整段送去翻译再按行数切回，下一句的意思常被提前翻进上一条。",
    here: "每条单独翻译，只拿所属原条目当上下文。模型漏掉的条目单独补问，偏长的译文只提示、不丢弃。",
  },
  {
    topic: "译名",
    usual: "分批翻译后，同一个人名前后出现两三种译法，最后只能逐条搜索替换。",
    here: "填一张人名与术语表，比如 Zane = 赞恩，每一批都按表翻译。",
  },
];

export function Why() {
  return (
    <section id="why" className="site-section" aria-labelledby="why-title">
      <p className="eyebrow">为什么</p>
      <h2 id="why-title">字幕翻译最容易出错的三个地方。</h2>
      <div className="problem-list">
        {PROBLEMS.map((problem) => (
          <article key={problem.topic} className="problem">
            <h3>{problem.topic}</h3>
            <div>
              <p className="problem-usual"><span>常见做法</span>{problem.usual}</p>
              <p className="problem-here"><span>这里</span>{problem.here}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { title: "导入", body: "把 Buzz 导出的英文 .srt 拖进工作台，选好剪辑软件和横竖屏。" },
  { title: "翻译、校对", body: "填 DeepSeek Key 开始翻译。用「需检查」筛出读不完、显示太短的条目，⌘/Ctrl + ↑↓ 逐条改。" },
  { title: "导出", body: "下载双语 SRT（UTF-8 BOM、CRLF），拖进达芬奇媒体池或 Premiere 的字幕轨。" },
];

export function Steps() {
  return (
    <section id="how" className="site-section" aria-labelledby="how-title">
      <p className="eyebrow">使用方法</p>
      <h2 id="how-title">三步完成。</h2>
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
    question: "要花钱吗？",
    answer: "工具本身免费。翻译走你自己的 DeepSeek 账户，按 DeepSeek 的价格计费，费用取决于台词量和所选模型。",
  },
  {
    question: "导入达芬奇后中英文怎么排？",
    answer: "每条导出为「中文一行 + 英文一行」，只有超长时才换行，中文在上或英文在上可选。字体、字号、描边和位置在达芬奇的字幕轨道 Inspector 或 Premiere 的 Track Style 里统一设置。",
  },
  {
    question: "Key 和字幕会被保存吗？",
    answer: "字幕原文和翻译进度只保存在你的浏览器里。翻译时，字幕文本和 Key 经本站服务器转发给 DeepSeek，本站不保存。Key 默认不记住；勾选「记住」后只存在这台电脑的浏览器里，随时可以一键清除。",
  },
  {
    question: "翻到一半断了怎么办？",
    answer: "已经译好的条目不会丢。点「继续任务」从断点接着翻；关掉页面也没关系，下次打开从「上次的任务」继续。",
  },
  {
    question: "能直接交付吗？",
    answer: "断句和翻译只看得到文字，看不到画面、听不到声音。导入剪辑软件后，请对照视频完整过一遍再交付。",
  },
];

export function Faq() {
  return (
    <section id="faq" className="site-section faq" aria-labelledby="faq-title">
      <p className="eyebrow">常见问题</p>
      <h2 id="faq-title">开始之前。</h2>
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
        <a className="brand" href="#top">
          <LogoMark />
          <strong>双语字幕工坊</strong>
        </a>
        <nav aria-label="项目链接">
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">更新日志</a>
          <a href={`${REPO}/blob/main/docs/subtitle-rules.md`} target="_blank" rel="noreferrer">字幕规则与来源</a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">问题反馈</a>
        </nav>
      </div>
      <p className="footer-legal">
        字幕原文和翻译进度只保存在你的浏览器中。翻译时，字幕文本和 API Key 经本站服务器转发给 DeepSeek，本站不保存。
      </p>
    </footer>
  );
}
