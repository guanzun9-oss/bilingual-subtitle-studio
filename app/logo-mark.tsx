/** Wordmark glyph: two subtitle lines, the longer one on top. Drawn in the current text colour. */
export default function LogoMark({ className = "logo-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="9" width="20" height="3.2" rx="1.6" fill="currentColor" />
      <rect x="6" y="15" width="12" height="3.2" rx="1.6" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
