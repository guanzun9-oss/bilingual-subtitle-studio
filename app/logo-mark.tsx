/** App icon: two subtitle lines on a blue gradient tile. Each use needs its own `gradientId`. */
export default function LogoMark({ className = "logo-mark", gradientId }: { className?: string; gradientId: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="1" stopColor="#5e5ce6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <rect x="7" y="16" width="18" height="3" rx="1.5" fill="#fff" />
      <rect x="10" y="21.5" width="12" height="3" rx="1.5" fill="#fff" opacity="0.7" />
    </svg>
  );
}
