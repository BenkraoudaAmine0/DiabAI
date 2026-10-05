"use client";

import { useI18n, type Lang } from "@/i18n";

/** DiabAI water-drop brand mark (login/landing pages). */
export function DropletLogo({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M24 3.5C24 3.5 9.5 20.6 9.5 30.2a14.5 14.5 0 0 0 29 0C38.5 20.6 24 3.5 24 3.5Z"
        fill="#0E7C66"
      />
      <circle cx="19" cy="27.5" r="2.3" fill="#CDEEE2" />
      <circle cx="29" cy="27.5" r="2.3" fill="#CDEEE2" />
      <path
        d="M19 34.5c1.6 1.7 3.3 2.5 5 2.5s3.4-.8 5-2.5"
        stroke="#CDEEE2"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Segmented EN/FR pill, styled after the login/landing mockups. */
export function SegmentedLangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex items-center rounded-full bg-slate-100 p-1">
      {(["en", "fr"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase transition-colors ${
            lang === l
              ? "bg-[#0E7C66] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
