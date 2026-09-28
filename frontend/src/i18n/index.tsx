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

import en from "./en";
import fr from "./fr";

export type Lang = "en" | "fr";

const dictionaries: Record<Lang, Record<string, string>> = { en, fr };

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

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={`inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      {(["en", "fr"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 font-medium uppercase transition-colors ${
            lang === l
              ? "bg-teal-600 text-white"
              : "text-slate-500 hover:text-teal-700"
          }`}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
