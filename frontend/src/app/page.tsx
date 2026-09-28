"use client";

import Link from "next/link";

import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";

const FEATURES = [
  { key: "f1", icon: "🩺" },
  { key: "f2", icon: "🦶" },
  { key: "f3", icon: "🧣" },
  { key: "f4", icon: "👁" },
  { key: "f5", icon: "💬" },
];

export default function Landing() {
  const { t } = useI18n();
  const { session, profile } = useAuth();

  const homeHref = session
    ? profile?.role === "admin"
      ? "/admin/dashboard"
      : profile?.role === "doctor"
        ? "/doctor/dashboard"
        : "/patient"
    : "/login";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 lg:px-12">
        <Logo />
        <div className="flex items-center gap-3">
          <LangToggle />
          {session ? (
            <Link
              href={homeHref}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              {t("nav.home")}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {t("common.login")}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6">
        <section className="flex flex-col items-center gap-6 py-16 text-center lg:py-24">
          <span className="rounded-full bg-teal-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
            {t("app.tagline")}
          </span>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 lg:text-6xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            {t("landing.heroSubtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/register?role=doctor"
              className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              {t("landing.ctaDoctor")}
            </Link>
            <Link
              href="/register?role=patient"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("landing.ctaPatient")}
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon }) => (
            <div
              key={key}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <span className="text-3xl" aria-hidden>
                {icon}
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">
                {t(`landing.${key}.title`)}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {t(`landing.${key}.desc`)}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-400">
        DiabAI — ThirUni Program © 2026
      </footer>
    </div>
  );
}
