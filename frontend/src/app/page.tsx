"use client";

import { useEffect } from "react";
import Link from "next/link";

import PublicShell, { pubEyebrow } from "@/components/public/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

const MODULES = ["m1", "m2", "m3", "m4", "m5", "m6"] as const;
const PATHWAY = ["record", "risk", "screening", "followup"] as const;
const PRIVACY = ["access", "audit", "rights", "storage"] as const;

/** Figma "Page new" · Landing EN (59:153). */
export default function Landing() {
  const { t } = useI18n();
  const { session, profile } = useAuth();

  // Invitation / reset links land here instead of /set-password when the
  // callback URL isn't in Supabase's Redirect URLs (it falls back to the
  // Site URL) — pass them on, or the patient ends up with no password.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const type = hash.get("type");
    if (type === "invite" || type === "recovery" || hash.get("error_code")) {
      window.location.replace(`/set-password${window.location.hash}`);
    }
  }, []);

  const homeHref =
    profile?.role === "admin" ? "/admin/dashboard" : profile?.role === "doctor" ? "/doctor/dashboard" : "/patient";

  return (
    <PublicShell action={session ? { href: homeHref, label: t("pub.workspace") } : { href: "/login", label: t("pub.login") }}>
      <section className="flex flex-col items-center gap-12 px-4 pb-16 pt-12 sm:px-12 lg:px-24 lg:pt-[72px] xl:flex-row xl:gap-[72px]">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <span className="w-fit rounded-full bg-pub-mint px-3 py-[7px] text-[13px] font-semibold text-pub-deep">{t("pub.hero.eyebrow")}</span>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-[-1.08px] text-pub-dark sm:text-[54px]">{t("pub.hero.title")}</h1>
          <p className="text-lg leading-[1.55] text-pub-muted">{t("pub.hero.text")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#modules"
              className="flex h-[52px] w-[248px] items-center justify-center rounded-xl bg-pub-primary px-6 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(8,61,50,0.07)] hover:opacity-95"
            >
              {t("pub.hero.cta")}
            </a>
            <p className="w-[220px] text-sm leading-[1.4] text-pub-muted">{t("pub.hero.note")}</p>
          </div>
        </div>

        <div className="flex w-full max-w-[520px] shrink-0 flex-col gap-6 rounded-[28px] bg-pub-dark p-8 shadow-[0_18px_50px_rgba(6,61,48,0.13)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1 font-semibold">
              <p className="text-xs uppercase tracking-[0.96px] text-pub-mint">{t("pub.card.eyebrow")}</p>
              <p className="text-lg text-white">{t("pub.card.title")}</p>
            </div>
            <span className="size-3.5 shrink-0 rounded-full border-[3px] border-pub-mint bg-pub-accent" aria-hidden />
          </div>
          <ol className="flex flex-col gap-3">
            {PATHWAY.map((step, i) => {
              const focus = i === 2;
              return (
                <li key={step} className={`flex items-center gap-3 rounded-xl px-3.5 py-3 ${focus ? "bg-[#15483f]" : "bg-[#103a34]"}`}>
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${focus ? "bg-pub-accent" : "bg-[#28534b]"}`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-white">{t(`pub.path.${step}`)}</span>
                  <span className="text-xs text-pub-mint" aria-hidden>
                    ●
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section id="modules" className="flex scroll-mt-4 flex-col gap-8 bg-pub-mint-soft px-4 pb-[72px] pt-16 sm:px-12 lg:px-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[690px] flex-col gap-3">
            <p className={pubEyebrow}>{t("pub.mod.eyebrow")}</p>
            <h2 className="text-3xl font-bold leading-[1.15] tracking-[-0.42px] text-pub-dark sm:text-[42px]">{t("pub.mod.title")}</h2>
          </div>
          <p className="max-w-[430px] text-base leading-[1.55] text-pub-muted">{t("pub.mod.text")}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((m, i) => (
            <article
              key={m}
              className="flex min-h-[188px] flex-col gap-4 rounded-[18px] border border-pub-line bg-white p-6 shadow-[0_10px_30px_rgba(8,61,50,0.07)]"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-pub-mint px-2.5 py-1.5 text-xs font-bold tracking-[0.48px] text-pub-deep">M{i + 1}</span>
                <span className="size-[9px] rounded-full bg-pub-accent" aria-hidden />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-pub-dark">{t(`pub.mod.${m}.name`)}</h3>
                <p className="text-sm leading-[1.5] text-pub-muted">{t(`pub.mod.${m}.text`)}</p>
              </div>
            </article>
          ))}
        </div>
        <div id="disclaimer" className="flex scroll-mt-4 items-start gap-3 rounded-xl border border-[#e7c96b] bg-[#fff8e7] px-6 py-4">
          <span className="mt-1 size-2.5 shrink-0 rounded-full bg-[#e7b416]" aria-hidden />
          <div className="flex flex-col gap-1 text-sm text-[#684e06]">
            <p className="font-bold">{t("pub.disc.title")}</p>
            <p className="leading-[1.45]">{t("pub.disc.text")}</p>
          </div>
        </div>
      </section>

      <section id="privacy" className="flex scroll-mt-4 flex-col gap-6 px-4 py-16 sm:px-12 lg:px-24">
        <div className="flex max-w-[690px] flex-col gap-3">
          <p className={pubEyebrow}>{t("pub.priv.eyebrow")}</p>
          <h2 className="text-3xl font-bold leading-[1.15] text-pub-dark">{t("pub.priv.title")}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PRIVACY.map((k) => (
            <div key={k} className="flex items-start gap-3 rounded-xl bg-pub-mint-soft px-4 py-3.5">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-pub-primary" aria-hidden />
              <p className="text-sm font-medium leading-[1.5] text-pub-ink">{t(`pub.priv.${k}`)}</p>
            </div>
          ))}
        </div>
        {!session && (
          <p className="text-sm text-pub-muted">
            {t("pub.priv.cta")}{" "}
            <Link href="/register" className="font-semibold text-pub-primary hover:underline">
              {t("pub.createAccount")}
            </Link>
          </p>
        )}
      </section>
    </PublicShell>
  );
}
