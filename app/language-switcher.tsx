"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locales";

/** Interface language picker. Remembers the choice so `/` opens it next time. */
export default function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  return (
    <label className="language-switcher">
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.75 8h12.5M8 1.75c1.9 2 1.9 10.5 0 12.5M8 1.75c-1.9 2-1.9 10.5 0 12.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      <select
        value={locale}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value;
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          router.push(`/${next}${window.location.hash}`);
        }}
      >
        {LOCALES.map((entry) => (
          <option key={entry.code} value={entry.code} lang={entry.code}>{entry.name}</option>
        ))}
      </select>
    </label>
  );
}
