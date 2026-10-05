"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CircleAlert,
  Eye,
  MessageSquare,
  Plus,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import ActivityResult, { activityModule } from "@/components/ActivityResult";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { whenLabel } from "@/lib/clinical";
import type { DoctorDashboard, UrgentAlert } from "@/lib/types";

/** Figma "KPI-Card": label · tinted 32px icon · Plex Mono value · note. */
function Kpi({
  label,
  value,
  sub,
  icon: IconCmp,
  tone,
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.01)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-semibold text-slate-500">{label}</p>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <IconCmp size={16} strokeWidth={1.8} />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[28px] font-bold leading-none text-slate-900">{value}</p>
        <p className="truncate text-xs font-medium text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: UrgentAlert }) {
  const { t, lang } = useI18n();
  const value =
    alert.reason === "glucose"
      ? ` (${t("alert.glucoseShort")} ${alert.value} mg/dL)`
      : alert.reason === "hba1c"
        ? ` (HbA1c ${String(alert.value).replace(".", lang === "fr" ? "," : ".")} %)`
        : "";
  return (
    <Link
      href={alert.link}
      className="flex items-center gap-2.5 rounded-lg border border-[#fee2e2] bg-[#fef2f2] p-2.5 transition-colors hover:bg-[#fee2e2]"
    >
      <TriangleAlert size={16} className="shrink-0 text-status-critical" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-bold text-[#991b1b]">{t(`alert.${alert.reason}`)}</span>
        <span className="truncate text-[11px] text-[#7f1d1d]">
          {t("alert.patient", { name: alert.patient_name })}
          {value} · {whenLabel(alert.created_at, lang, t)}
        </span>
      </span>
    </Link>
  );
}

/** Figma 02 Doctor Screens · Screen-4-Dashboard (2:225) over the doctor's
 *  panel (GET /api/dashboard/doctor). */
export default function DoctorDashboardPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<DoctorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DoctorDashboard>("/api/dashboard/doctor")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);

  const k = data?.kpis;
  const diff = k ? k.evaluations.this_week - k.evaluations.last_week : 0;

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {k ? (
          <>
            <Kpi
              label={t("dash.kpiPatients")}
              value={k.patients.total}
              sub={t("dash.kpiPatientsSub", { n: k.patients.new_this_week })}
              icon={Users}
              tone="bg-brand/[0.08] text-brand"
            />
            <Kpi
              label={t("dash.kpiEvals")}
              value={k.evaluations.this_week}
              sub={t("dash.kpiEvalsSub", { diff: diff >= 0 ? `+${diff}` : String(diff) })}
              icon={Activity}
              tone="bg-brand-teal/[0.08] text-brand-teal"
            />
            <Kpi
              label={t("dash.kpiRetinal")}
              value={k.retinal.total}
              sub={t("dash.kpiRetinalSub", { n: k.retinal.positive_to_review })}
              icon={Eye}
              tone="bg-status-diabetes/[0.08] text-status-diabetes"
            />
            <Kpi
              label={t("dash.kpiReviews")}
              value={k.reviews.pending}
              sub={t("dash.kpiReviewsSub", { n: k.reviews.urgent })}
              icon={CircleAlert}
              tone="bg-status-critical/[0.08] text-status-critical"
            />
          </>
        ) : (
          !error &&
          [0, 1, 2, 3].map((i) => <div key={i} className="h-[126px] animate-pulse rounded-xl border border-slate-200 bg-white" />)
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">{t("dash.recent")}</h2>
            <Link href="/doctor/history" className="text-[13px] font-semibold text-brand hover:underline">
              {t("dash.seeAll")}
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {!data && !error && [0, 1, 2, 3].map((i) => <li key={i} className="h-[62px] animate-pulse rounded-lg bg-slate-100" />)}
            {data && data.recent.length === 0 && (
              <li className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                {t("dash.noActivity")}
              </li>
            )}
            {data?.recent.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.link}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand/40 hover:bg-[#f6faf8]"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-bold text-slate-900">
                      {item.patient_name}{" "}
                      {item.age != null && (
                        <span className="text-xs font-normal text-slate-500">({t("common.ageShort", { n: item.age })})</span>
                      )}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {whenLabel(item.created_at, lang, t)} • {t(activityModule(item))}
                    </span>
                  </span>
                  <ActivityResult item={item} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">{t("dash.quickActions")}</h2>
            <div className="flex flex-col gap-2">
              <Link href="/doctor/diabetes" className="flex items-center justify-center gap-2 rounded-md bg-brand p-2.5 text-[13px] font-semibold text-white hover:opacity-90">
                <Plus size={14} />
                {t("dash.newEval")}
              </Link>
              <Link href="/doctor/retina" className="flex items-center justify-center gap-2 rounded-md bg-brand-teal p-2.5 text-[13px] font-semibold text-white hover:opacity-90">
                <Eye size={14} />
                {t("dash.retinal")}
              </Link>
              <Link href="/chat" className="flex items-center justify-center gap-2 rounded-md bg-slate-900 p-2.5 text-[13px] font-semibold text-white hover:opacity-90">
                <MessageSquare size={14} />
                {t("dash.askAi")}
              </Link>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">{t("dash.alerts")}</h2>
            {!data && !error && <div className="h-14 animate-pulse rounded-lg bg-slate-100" />}
            {data && data.alerts.length === 0 && (
              <p className="rounded-lg bg-[#dcfce7] px-3 py-2.5 text-xs font-semibold text-status-normal">{t("dash.noAlerts")}</p>
            )}
            {data?.alerts.map((a) => <AlertRow key={`${a.kind}-${a.id}`} alert={a} />)}
          </section>
        </div>
      </div>
    </div>
  );
}
