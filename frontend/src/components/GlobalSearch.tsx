"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import ClinicalBadge from "@/components/ClinicalBadge";
import Icon from "@/components/Icon";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { initials, shortId } from "@/lib/clinical";
import type { PatientSearchResult } from "@/lib/types";

/** Top-bar patient search ("Rechercher un dossier patient…"): name, email,
 *  phone or patient ID, accents ignored. Ctrl+K or "/" focuses it; ↑ ↓ Enter
 *  pick a result; Escape closes. */
export default function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // debounced server search
  useEffect(() => {
    const query = q.trim();
    let cancelled = false;
    const id = window.setTimeout(async () => {
      if (query.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const r = await api<{ results: PatientSearchResult[] }>(
          `/api/patients/search?q=${encodeURIComponent(query)}`
        );
        if (!cancelled) {
          setResults(r.results);
          setActive(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.length < 2 ? 0 : 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [q]);

  // Ctrl+K / "/" from anywhere focuses the search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement | null)?.tagName ?? ""
      );
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(id: string) {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    router.push(`/doctor/patients/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const query = q.trim();

  return (
    <div className="relative w-full max-w-[300px]">
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-[34px] pr-14 text-[13px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-medium text-slate-400 sm:block">
        Ctrl K
      </kbd>

      {open && (
        <div
          id="global-search-results"
          role="listbox"
          // keep the input focused while clicking a result
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {query.length < 2 ? (
            <p className="px-4 py-3 text-xs text-slate-400">{t("search.hint")}</p>
          ) : loading && results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">{t("search.searching")}</p>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">
              {t("search.none")} ·{" "}
              <Link href="/doctor/patients" className="font-semibold text-teal-600">
                {t("search.allPatients")}
              </Link>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li
                  key={r.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.id)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${
                    i === active ? "bg-teal-50" : ""
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                    {initials(r.full_name ?? r.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {r.full_name ?? r.email}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      ID {shortId(r.id)}
                      {r.age != null && ` · ${t("common.ageShort", { n: r.age })}`}
                      {r.email && r.full_name && ` · ${r.email}`}
                    </span>
                  </span>
                  <ClinicalBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
