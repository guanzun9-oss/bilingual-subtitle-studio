import LogoMark from "./logo-mark";

const REPO = "https://github.com/guanzun9-oss/bilingual-subtitle-studio";

export function SiteNav() {
  return (
    <header className="site-nav">
      <a className="brand" href="#top" aria-label="双语字幕工坊 首页">
        <LogoMark gradientId="nav-mark" />
        <strong>双语字幕工坊</strong>
      </a>
      <nav aria-label="页面导航">
        <a href="#features">功能</a>
        <a href="#how">使用方法</a>
        <a href="#faq">常见问题</a>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <a className="nav-cta" href="#studio">开始制作</a>
    </header>
  );
}

export function Hero() {
  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">Buzz 英文字幕 → 中英双语 SRT</p>
      <h1 id="hero-title">英文字幕，一步变双语。</h1>
      <p className="hero-lead">
        按句自然断句，逐条对齐翻译，直接导入达芬奇和 Premiere Pro。<br />
        无需安装，打开网页就能用。
      </p>
      <div className="hero-actions">
        <a className="primary-button" href="#studio">开始制作</a>
        <a className="text-link" href="#how">了解使用方法 ›</a>
      </div>
      <p className="hero-note">使用你自己的 DeepSeek API Key · 字幕不上传本站服务器</p>

      {/* A static illustration of the product, not a live preview. */}
      <figure className="product-shot" aria-label="双语字幕效果示意">
        <div className="shot-screen">
          <div className="shot-subtitles">
            <p>结果最难的，是理解大家真正需要什么。</p>
            <p lang="en">But it turned out to be understanding what people truly needed.</p>
          </div>
        </div>
        <div className="shot-track" aria-hidden="true">
          {[14, 9, 18, 7, 12, 16, 6, 11, 15, 8, 13, 10, 17, 9, 12, 7, 14, 11].map((width, index) => (
            <i key={index} className={index === 11 ? "warn" : ""} style={{ flexGrow: width }} />
          ))}
        </div>
        <figcaption>
          <span><b>132</b> 条原字幕</span>
          <span><b>248</b> 条双语字幕</span>
          <span><b>1</b> 条需检查</span>
        </figcaption>
      </figure>
    </section>
  );
}

const FEATURES = [
  {
    title: "自然断句",
    body: "原字幕只拆分、不合并；句末另起一条，超长句在自然停顿处拆开，时间轴始终落在原条目之内。",
  },
  {
    title: "逐条对齐",
    body: "以原条目为上下文逐条翻译，不把下一句提前译出；偏长的译文只做提示，不会被丢弃。",
  },
  {
    title: "译名统一",
    body: "填写人名与术语表，整部字幕使用同一种译法；每次只发送这一批用到的词条。",
  },
  {
    title: "进度不丢",
    body: "翻译进度和手动修改自动保存在本机浏览器，刷新、关闭页面后都能接着做。",
  },
  {
    title: "适配剪辑软件",
    body: "达芬奇、Premiere Pro 和通用 SRT 预设，横竖屏排版与整体时间偏移，并附导入说明。",
  },
  {
    title: "长片也流畅",
    body: "多批并行翻译，几千条字幕也能顺畅校对；字幕轨道图一眼看出哪里还需要检查。",
  },
];

export function Features() {
  return (
    <section id="features" className="site-section" aria-labelledby="features-title">
      <p className="eyebrow">功能</p>
      <h2 id="features-title">为字幕工作流而设计。</h2>
      <div className="feature-grid">
        {FEATURES.map((feature, index) => (
          <article key={feature.title} className="feature-card">
            <span className="feature-index">{String(index + 1).padStart(2, "0")}</span>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { title: "导入", body: "把 Buzz 导出的英文 .srt 拖进工作台，选择剪辑软件和画幅。" },
  { title: "翻译与校对", body: "填入 DeepSeek API Key 开始翻译，在列表中逐条检查和修改。" },
  { title: "导出", body: "下载中英双语 SRT，导入达芬奇或 Premiere Pro 的字幕轨道。" },
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
    question: "需要付费吗？",
    answer: "本工具免费使用。翻译调用 DeepSeek API，费用按你自己的 DeepSeek 账户计算。",
  },
  {
    question: "我的字幕和 API Key 安全吗？",
    answer: "字幕原文、译文进度和设置只保存在你的浏览器里，不保存到本站服务器。翻译时，字幕文本和 Key 经本站转发给 DeepSeek，不会被保存。Key 只有在你勾选「在本机浏览器记住 Key」后才保存在本机，取消勾选即删除。",
  },
  {
    question: "支持哪些字幕格式？",
    answer: "导入标准 SRT（针对 Buzz 导出的字幕优化），导出带 UTF-8 BOM 的中英双语或整理后的英文 SRT。",
  },
  {
    question: "翻译中断了怎么办？",
    answer: "已完成的条目会保留。点「继续任务」从中断处接着翻译；关闭页面后，下次打开可以从「上次的任务」继续。",
  },
  {
    question: "结果可以直接交付吗？",
    answer: "断句和翻译基于文本规则与模型，无法看到画面和听到声音。建议导入剪辑软件后，对照视频完整看一遍再交付。",
  },
];

export function Faq() {
  return (
    <section id="faq" className="site-section faq" aria-labelledby="faq-title">
      <p className="eyebrow">常见问题</p>
      <h2 id="faq-title">还想了解的。</h2>
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
      <div className="footer-grid">
        <div className="footer-brand">
          <a className="brand" href="#top">
            <LogoMark gradientId="footer-mark" />
            <strong>双语字幕工坊</strong>
          </a>
          <p>把 Buzz 英文字幕整理成自然断句、逐条对齐的中英双语 SRT。</p>
        </div>
        <nav aria-label="产品">
          <h3>产品</h3>
          <a href="#studio">工作台</a>
          <a href="#features">功能</a>
          <a href="#how">使用方法</a>
        </nav>
        <nav aria-label="资源">
          <h3>资源</h3>
          <a href={`${REPO}/blob/main/docs/subtitle-rules.md`} target="_blank" rel="noreferrer">字幕规则与来源</a>
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">更新日志</a>
          <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">获取 DeepSeek Key</a>
        </nav>
        <nav aria-label="项目">
          <h3>项目</h3>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">问题反馈</a>
        </nav>
      </div>
      <p className="footer-legal">
        字幕和译文进度只保存在你的浏览器中，不上传本站服务器；API Key 仅在勾选后保存在本机。翻译由 DeepSeek 处理。
      </p>
    </footer>
  );
}
