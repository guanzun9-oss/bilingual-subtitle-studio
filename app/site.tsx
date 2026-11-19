import { DEMO_PIECES, DEMO_TRANSLATIONS } from "@/lib/demo.mjs";
import { getLanguage } from "@/lib/languages.mjs";
import type { Locale, Messages } from "@/lib/i18n";
import LanguageSwitcher from "./language-switcher";
import { Wordmark } from "./logo-mark";

const REPO = "https://github.com/guanzun9-oss/bilingual-subtitle-studio";

export function SiteNav({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <header className="site-nav">
      <a className="brand" href="#top" aria-label={t.nav.home}>
        <Wordmark localName={t.brandLocal} />
      </a>
      <nav aria-label={t.nav.label}>
        <a href="#why">{t.nav.why}</a>
        <a href="#how">{t.nav.how}</a>
        <a href="#faq">{t.nav.faq}</a>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <div className="nav-end">
        <LanguageSwitcher locale={locale} label={t.nav.language} />
        <a className="nav-cta" href="#studio">{t.nav.start}</a>
      </div>
    </header>
  );
}

// Real output: the demo cue below, split and timed by lib/srt-core.mjs with default settings.
const RAW_CUE = {
  index: 1,
  time: "00:00:01,000 --> 00:00:08,600",
  text: "When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.",
};
const OUTPUT_TIMES = ["00:00:01,000 --> 00:00:03,082", "00:00:03,082 --> 00:00:05,268", "00:00:05,268 --> 00:00:08,600"];
const OUTPUT_SOURCE = ["When we started this project, we thought", "the hardest part would be the technology,", "but it turned out to be understanding\nwhat people truly needed."];

export function Hero({ t, target }: { t: Messages; target: string }) {
  // Show the reader's own language next to the English source.
  const samples = (DEMO_TRANSLATIONS as Record<string, Record<string, string>>)[target] ?? DEMO_TRANSLATIONS["zh-Hans"];
  const targetLanguage = getLanguage(target in DEMO_TRANSLATIONS ? target : "zh-Hans");
  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">{t.hero.eyebrow}</p>
      <h1 id="hero-title">{t.hero.title}</h1>
      <p className="hero-lead">
        {t.hero.lead}<br />
        {t.hero.lead2}
      </p>
      <div className="hero-actions">
        <a className="primary-button" href="#studio">{t.hero.start}</a>
        <a className="text-link" href="#demo">{t.hero.demo}</a>
      </div>
      <p className="hero-meta">{t.hero.meta}</p>

      <figure className="before-after" aria-label={t.hero.compare}>
        <div className="srt-pane" dir="ltr">
          <p className="pane-label">{t.hero.raw}</p>
          <pre className="srt-text" lang="en"><span className="srt-meta">{RAW_CUE.index}{"\n"}{RAW_CUE.time}</span>{"\n"}{RAW_CUE.text}</pre>
          <p className="pane-note">{t.hero.rawNote}</p>
        </div>
        <span className="pane-arrow" aria-hidden="true">→</span>
        <div className="srt-pane result" dir="ltr">
          <p className="pane-label">{t.hero.output}</p>
          <pre className="srt-text">
            {DEMO_PIECES.map((piece, index) => (
              <span key={OUTPUT_TIMES[index]} className="srt-cue">
                <span className="srt-meta">{RAW_CUE.index + index}{"\n"}{OUTPUT_TIMES[index]}</span>{"\n"}
                <b lang={targetLanguage.code} dir={targetLanguage.rtl ? "rtl" : "ltr"}>{samples[piece]}</b>{"\n"}
                <span lang="en">{OUTPUT_SOURCE[index]}</span>
              </span>
            ))}
          </pre>
          <p className="pane-note">{t.hero.outputNote}</p>
        </div>
      </figure>
    </section>
  );
}

export function Why({ t }: { t: Messages }) {
  return (
    <section id="why" className="site-section" aria-labelledby="why-title">
      <p className="eyebrow">{t.why.eyebrow}</p>
      <h2 id="why-title">{t.why.title}</h2>
      <div className="problem-list">
        {t.why.items.map((item) => (
          <article key={item.topic} className="problem">
            <h3>{item.topic}</h3>
            <div>
              <p className="problem-usual"><span>{t.why.usual}</span>{item.usual}</p>
              <p className="problem-here"><span>{t.why.here}</span>{item.here}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Steps({ t }: { t: Messages }) {
  return (
    <section id="how" className="site-section how" aria-labelledby="how-title">
      <div className="how-head">
        <p className="eyebrow">{t.steps.eyebrow}</p>
        <h2 id="how-title">{t.steps.title}</h2>
        <p className="how-lead">{t.steps.lead}</p>
      </div>
      <ol className="steps">
        {t.steps.items.map((step, index) => (
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

export function Faq({ t }: { t: Messages }) {
  return (
    <section id="faq" className="site-section faq" aria-labelledby="faq-title">
      <p className="eyebrow">{t.faq.eyebrow}</p>
      <h2 id="faq-title">{t.faq.title}</h2>
      <div className="faq-list">
        {t.faq.items.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function SiteFooter({ t }: { t: Messages }) {
  return (
    <footer className="site-footer">
      <div className="footer-row">
        <div className="footer-brand">
          <a className="brand" href="#top" aria-label={t.nav.home}>
            <Wordmark localName={t.brandLocal} />
          </a>
          <p>{t.footer.tagline}</p>
        </div>
        <nav aria-label={t.footer.links}>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">{t.footer.releases}</a>
          <a href={`${REPO}/blob/main/docs/subtitle-rules.md`} target="_blank" rel="noreferrer">{t.footer.rules}</a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">{t.footer.issues}</a>
        </nav>
      </div>
      <p className="footer-legal">{t.footer.legal}</p>
    </footer>
  );
}
