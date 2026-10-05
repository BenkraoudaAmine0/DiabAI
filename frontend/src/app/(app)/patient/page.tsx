"use client";

import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Footprints,
  HeartPulse,
  ScanFace,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { usePatientSummary } from "@/hooks/usePatientSummary";
import { useI18n } from "@/i18n";
import { firstName, greetingKey, shortDate } from "@/lib/patient";

/** Figma "Education card": 40px mint tile · tag / title / text · chevron. */
function EducationCard({
  href,
  icon: IconCmp,
  tag,
  title,
  text,
}: {
  href: string;
  icon: LucideIcon;
  tag?: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-pt-border bg-white p-3 transition-colors hover:border-pt-primary/40"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-primary">
        <IconCmp size={20} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {tag && (
          <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-pt-primary">{tag}</span>
        )}
        <span className="text-[15px] font-bold text-pt-ink">{title}</span>
        <span className="text-xs leading-[1.35] text-pt-muted">{text}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-pt-primary" />
    </Link>
  );
}

/** Figma 06 Patient Screens · Home (112:3418). */
export default function PatientHome() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const { summary } = usePatientSummary();

  const lastCheck = shortDate(summary?.last_check_at, lang);
  const nextVisit = shortDate(summary?.next_visit_at ?? profile?.next_visit_at, lang);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold leading-[1.15] text-pt-ink">
          {t(greetingKey(), { name: firstName(profile?.full_name) })}
        </h1>
        <p className="text-[13px] text-pt-muted">{t("pt.home.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* My health — opens the results the doctor confirmed */}
        <Link
          href="/patient/history"
          className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-pt-deep p-4 shadow-[0_4px_14px_rgba(23,51,47,0.07)] transition-opacity hover:opacity-95"
        >
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <HeartPulse size={20} className="text-white" strokeWidth={1.75} />
              <span className="text-xl font-bold text-white">{t("pt.home.myHealth")}</span>
            </span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white">
              {t("pt.home.private")}
            </span>
          </span>
          <span className="flex gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl bg-white/[0.07] p-3">
              <span className="text-xs text-white/72">{t("pt.home.lastCheck")}</span>
              <span className="text-[15px] font-bold text-white">{lastCheck ?? t("pt.home.none")}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl bg-white/[0.07] p-3">
              <span className="text-xs text-white/72">{t("pt.home.nextVisit")}</span>
              <span className="text-[15px] font-bold text-white">
                {nextVisit ?? t("pt.home.notScheduled")}
              </span>
            </span>
          </span>
        </Link>

        <Link
          href="/patient/questionnaire"
          className="flex h-[50px] items-center justify-between overflow-hidden rounded-xl bg-pt-primary px-4 shadow-[0_6px_18px_rgba(11,107,95,0.13)] transition-opacity hover:opacity-95"
        >
          <span className="text-[15px] font-bold text-white">{t("pt.home.riskQuestionnaire")}</span>
          <ClipboardCheck size={20} className="text-white" strokeWidth={1.75} />
        </Link>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-pt-ink">{t("pt.home.forYou")}</p>
          <EducationCard
            href="/patient/learn/diabetes-basics"
            icon={BookOpen}
            tag={t("pt.home.readTime", { n: 5 })}
            title={t("pt.home.learnBasics")}
            text={t("pt.home.learnBasicsDesc")}
          />

          {/* not in the Figma home: existing patient features stay reachable */}
          <p className="mt-2 text-sm font-bold text-pt-ink">{t("pt.home.myCare")}</p>
          <EducationCard
            href="/patient/history"
            icon={FileCheck2}
            title={t("pt.home.results")}
            text={t("pt.home.resultsDesc")}
          />
          <EducationCard
            href="/patient/foot"
            icon={Footprints}
            title={t("pt.home.foot")}
            text={t("pt.home.footDesc")}
          />
          <EducationCard
            href="/patient/neck"
            icon={ScanFace}
            title={t("pt.home.neck")}
            text={t("pt.home.neckDesc")}
          />
        </div>
      </div>
    </div>
  );
}
