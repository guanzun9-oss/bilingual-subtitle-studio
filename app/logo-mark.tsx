/** Cuewise mark: a subtitle frame holding two lines, drawn in the current text colour. */
export default function LogoMark({ className = "logo-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="4.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6.5" y="9.6" width="11" height="2" rx="1" fill="currentColor" />
      <rect x="8.75" y="13.4" width="6.5" height="2" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/** Logo lockup: mark, the Latin wordmark, and the Chinese name. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span className="wordmark-name">Cuewise</span>
      <span className="wordmark-cn">字幕匠</span>
    </span>
  );
}
