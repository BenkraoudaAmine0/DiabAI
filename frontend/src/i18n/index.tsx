"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import adEn from "./admin.en";
import adFr from "./admin.fr";
import en from "./en";
import fr from "./fr";
import drEn from "./doctor.en";
import drFr from "./doctor.fr";
import ptEn from "./patient.en";
import ptFr from "./patient.fr";
import pubEn from "./public.en";
import pubFr from "./public.fr";

export type Lang = "en" | "fr";

const dictionaries: Record<Lang, Record<string, string>> = {
  en: { ...en, ...ptEn, ...drEn, ...adEn, ...pubEn },
  fr: { ...fr, ...ptFr, ...drFr, ...adFr, ...pubFr },
};

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("diabai-lang");
    // the saved choice only exists in the browser: read it after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "fr" || saved === "en") setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("diabai-lang", l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}

/** Doctor screens' compact switcher (Figma "Language-Switcher" in the top
 *  bar): "FR | EN" text, the active language #0e7c4a. */
export function LangText() {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[13px]"
    >
      {(["fr", "en"] as Lang[]).map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="h-2.5 w-px bg-slate-200" />}
          <button
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={`uppercase ${lang === l ? "font-semibold text-brand" : "font-medium text-slate-500 hover:text-slate-800"}`}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  );
}

/** Figma 00 Brand · "Language switcher": a 136×32 segmented control,
 *  #e8f0ec track, the active half filled #0e7c4a. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className={`flex h-8 w-[136px] shrink-0 overflow-hidden rounded-lg bg-brand-switch ${className}`}
    >
      {(["en", "fr"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`h-8 w-[68px] rounded-lg text-[13px] font-bold uppercase transition-colors ${
            lang === l ? "bg-brand text-white" : "text-brand-teal hover:bg-brand/10"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
