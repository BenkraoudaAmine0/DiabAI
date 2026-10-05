"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/i18n";

const ARTICLES = [
  { key: "t2", href: "/doctor/type-classification" },
  { key: "hba1c", href: "/doctor/diabetes" },
  { key: "retina", href: "/doctor/retina" },
  { key: "ramadan", href: "/chat" },
  { key: "gdm", href: "/doctor/type-classification" },
  { key: "kidney", href: "/doctor/complications" },
] as const;

// trilingual glossary (FR · EN · AR) — Figma "Glossaire médical trilingue"
const GLOSSARY: [string, string, string][] = [
  ["Glycémie à jeun", "Fasting blood glucose", "مستوى السكر في الدم صائم"],
  ["Hémoglobine glyquée (HbA1c)", "Glycated haemoglobin (HbA1c)", "الهيموغلوبين السكري"],
  ["Rétinopathie diabétique", "Diabetic retinopathy", "اعتلال الشبكية السكري"],
  ["Néphropathie diabétique", "Diabetic nephropathy", "اعتلال الكلية السكري"],
  ["Pied diabétique", "Diabetic foot", "القدم السكرية"],
  ["Hypoglycémie", "Hypoglycaemia", "انخفاض السكر في الدم"],
  ["Insuline", "Insulin", "الأنسولين"],
  ["Jeûne du Ramadan", "Ramadan fasting", "صيام رمضان"],
];

/** Figma 02 Doctor Screens · help-education (2:3291). */
export default function DoctorHelpPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const articles = useMemo(
    () =>
      ARTICLES.filter(
        (a) => !query || `${t(`help.a.${a.key}.title`)} ${t(`help.a.${a.key}.text`)}`.toLowerCase().includes(query)
      ),
    [query, t]
  );
  const glossary = useMemo(
    () => GLOSSARY.filter((row) => !query || row.join(" ").toLowerCase().includes(query)),
    [query]
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-[28px] font-extrabold text-slate-900">{t("help.title")}</h1>
        <label className="relative block w-full max-w-[420px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("help.search")}
            aria-label={t("help.search")}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-[34px] pr-3 text-[13px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold text-slate-900">{t("help.basics")}</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-slate-500">{t("help.none")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {articles.map((a) => (
              <Link key={a.key} href={a.href} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand/40">
                <p className="text-[15px] font-bold text-slate-900">{t(`help.a.${a.key}.title`)}</p>
                <p className="text-[13px] leading-[18px] text-slate-700">{t(`help.a.${a.key}.text`)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold text-slate-900">{t("help.emergency")}</h2>
          <div className="flex flex-col gap-3">
            <a href="tel:14" className="flex items-center gap-3 rounded-lg border border-[#fee2e2] bg-[#fef2f2] p-4">
              <span className="text-[22px] font-extrabold text-status-critical">14</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-900">{t("help.civil")}</span>
                <span className="text-xs text-slate-500">{t("help.civilDesc")}</span>
              </span>
            </a>
            <a href="tel:17" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <span className="text-[22px] font-extrabold text-brand">17</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-900">{t("help.police")}</span>
                <span className="text-xs text-slate-500">{t("help.policeDesc")}</span>
              </span>
            </a>
            <p className="text-xs text-slate-500">{t("help.samuNote")}</p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold text-slate-900">{t("help.glossary")}</h2>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex gap-4 border-b border-slate-200 pb-3 text-xs font-bold text-slate-500">
              <span className="flex-1">Français</span>
              <span className="flex-1">English</span>
              <span className="flex-1 text-right" dir="rtl">
                العربية
              </span>
            </div>
            {glossary.map(([fr, en, ar], i) => (
              <div key={fr} className={`flex items-center gap-4 py-2 text-[13px] ${i < glossary.length - 1 ? "border-b border-slate-200" : ""}`}>
                <span className="flex-1 font-semibold text-slate-900">{fr}</span>
                <span className="flex-1 text-slate-700">{en}</span>
                <span className="flex-1 text-right text-brand" dir="rtl" lang="ar">
                  {ar}
                </span>
              </div>
            ))}
            {glossary.length === 0 && <p className="text-sm text-slate-500">{t("help.none")}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
