"use client";

import Link from "next/link";

import { DropletLogo, SegmentedLangToggle } from "@/components/Brand";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

const MODULES = ["m1", "m2", "m3", "m4", "m5", "m6"] as const;
const PANEL = ["panel1", "panel2", "panel3", "panel4"] as const;

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
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F8F6]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <DropletLogo />
          <span className="text-[22px] font-bold tracking-tight text-slate-900">
            DiabAI
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <SegmentedLangToggle />
          {session ? (
            <Link
              href={homeHref}
              className="rounded-xl bg-[#0E7C66] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0B6455]"
            >
              {t("nav.home")}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              {t("common.login")}
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-14 lg:px-10 lg:py-[72px]">
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)] lg:gap-16">
            <div>
              <span className="inline-block rounded-full bg-[#DFEFE8] px-4 py-1.5 text-[13px] font-semibold text-[#0B4F41]">
                {t("landing.badge")}
              </span>
              <h1 className="mt-6 max-w-xl text-[2.6rem] font-bold leading-[1.1] tracking-tight text-[#113B32] xl:text-[3.1rem]">
                {t("landing.heroTitle")}
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-500">
                {t("landing.heroSubtitle")}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-5">
                <Link
                  href="#modules"
                  className="rounded-xl bg-[#0E7C66] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0B6455]"
                >
                  {t("landing.ctaModules")}
                </Link>
                <span className="max-w-[190px] text-[13px] leading-snug text-slate-500">
                  {t("landing.ctaNote")}
                </span>
              </div>
            </div>

            {/* Secure view panel */}
            <div className="rounded-3xl bg-[#0B3B31] p-7 shadow-[0_30px_70px_-32px_rgba(11,59,49,0.6)] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FD4BE]">
                    {t("landing.panelEyebrow")}
                  </p>
                  <h2 className="mt-1.5 text-lg font-semibold text-white">
                    {t("landing.panelTitle")}
                  </h2>
                </div>
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                </span>
              </div>
              <ul className="mt-6 space-y-3">
                {PANEL.map((k, i) => {
                  const active = i === 2;
                  return (
                    <li
                      key={k}
                      className={`flex items-center gap-3.5 rounded-xl px-4 py-3.5 ${
                        active ? "bg-[#155748]" : "bg-[#0E4A3C]"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                          active
                            ? "bg-[#2FBF8F] text-[#0B3B31]"
                            : "bg-[#1A5C4C] text-white"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium text-white">
                        {t(`landing.${k}`)}
                      </span>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          active ? "bg-[#7ED9BC]" : "bg-white/40"
                        }`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Trust band */}
        <div className="flex flex-col items-center justify-between gap-3 bg-[#0B3B31] px-6 py-6 text-sm text-white/80 sm:flex-row lg:px-16">
          <div className="flex items-center gap-3">
            <span className="h-5 w-1.5 rounded-full bg-[#2FBF8F]" />
            <span>{t("landing.bandTag")}</span>
          </div>
          <div className="flex items-center gap-8">
            {(["bandPrivacy", "bandTerms", "bandContact"] as const).map((k) => (
              <a
                key={k}
                href="#"
                onClick={(e) => e.preventDefault()}
                className="transition-colors hover:text-white"
              >
                {t(`landing.${k}`)}
              </a>
            ))}
          </div>
        </div>

        {/* Modules */}
        <section id="modules" className="bg-[#ECF4F0] px-6 py-16 lg:px-10 lg:py-20">
          <div className="mx-auto w-full max-w-[1240px]">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E7C66]">
              {t("landing.eyebrow")}
            </p>
            <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] lg:items-end">
              <h2 className="max-w-xl text-[2.4rem] font-bold leading-[1.12] tracking-tight text-[#113B32] xl:text-[2.6rem]">
                {t("landing.modulesTitle")}
              </h2>
              <p className="text-[15px] leading-relaxed text-slate-500 lg:pb-2">
                {t("landing.modulesDesc")}
              </p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => (
                <div
                  key={m}
                  className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_32px_-20px_rgba(11,59,49,0.3)]"
                >
                  <div className="flex items-start justify-between">
                    <span className="rounded-md bg-[#DFEFE8] px-2.5 py-1 text-xs font-bold text-[#0B4F41]">
                      M{i + 1}
                    </span>
                    <span className="mt-1 h-2 w-2 rounded-full bg-[#0E7C66]" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[#123B32]">
                    {t(`landing.${m}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {t(`landing.${m}.desc`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Join CTA */}
        <section className="bg-[#0B3B31] px-6 py-20 text-center lg:px-10">
          <h2 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-white">
            {t("landing.ctaTitle")}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-white/70">
            {t("landing.ctaDesc")}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={session ? homeHref : "/register"}
              className="rounded-xl bg-[#0E7C66] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0B6455]"
            >
              {t("landing.ctaJoin")}{" "}
              <span aria-hidden className="ml-1">
                →
              </span>
            </Link>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="rounded-xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#113B32] transition-colors hover:bg-slate-100"
            >
              {t("landing.ctaContact")}{" "}
              <span aria-hidden className="ml-1">
                ✉
              </span>
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white px-6 pt-14 lg:px-16">
        <div className="mx-auto grid w-full max-w-[1240px] gap-10 pb-12 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-24">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <DropletLogo size={34} />
              <span className="text-xl font-bold text-slate-900">DiabAI</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              {t("landing.footerDesc")}
            </p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {t("landing.navTitle")}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
              <li>
                <a href="#modules" className="transition-colors hover:text-[#0E7C66]">
                  {t("landing.navFeatures")}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="transition-colors hover:text-[#0E7C66]"
                >
                  {t("landing.navAbout")}
                </a>
              </li>
              <li>
                <a href="#modules" className="transition-colors hover:text-[#0E7C66]">
                  {t("landing.navModules")}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="transition-colors hover:text-[#0E7C66]"
                >
                  {t("landing.navContact")}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {t("landing.legalTitle")}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
              {(["legal1", "legal2", "legal3", "legal4"] as const).map((k) => (
                <li key={k}>{t(`landing.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 py-6">
          <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <p className="font-semibold text-slate-500">
                {t("landing.bottomNote")}
              </p>
              <p className="mt-1 leading-relaxed">
                {t("landing.bottomCompliance")}
              </p>
            </div>
            <p className="shrink-0 sm:text-right">
              © {year} {t("landing.copyright")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
