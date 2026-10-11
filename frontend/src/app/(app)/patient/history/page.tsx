"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileHeart, Footprints, IdCard, MessageCircle, ScanFace, Stethoscope, type LucideIcon } from "lucide-react";

import ClinicalBadge from "@/components/ClinicalBadge";
import VitalsTiles from "@/components/patient/VitalsTiles";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { clinicalStatusOf } from "@/lib/clinical";
import { shortDate } from "@/lib/patient";
import type { ClinicalStatus, PatientVitals, PredictionRow, ScanRow } from "@/lib/types";

interface MeProfile {
  email: string | null;
  phone: string | null;
  dob: string | null;
  sex: "male" | "female" | null;
  blood_group?: string | null;
  cnas_number?: string | null;
  chifa_number?: string | null;
  created_at?: string | null;
}

interface TimelineItem {
  key: string;
  at: string;
  title: string;
  text: string;
  status?: ClinicalStatus;
  href?: string;
}

const card = "flex flex-col gap-4 rounded-2xl border border-pt-border bg-white p-5";

function CardTitle({ icon: IconCmp, title, aside }: { icon: LucideIcon; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
          <IconCmp size={18} strokeWidth={1.75} />
        </span>
        <span className="text-base font-bold text-pt-ink">{title}</span>
      </span>
      {aside}
    </div>
  );
}

/** "My results": the patient's own record, laid out like the doctor's
 *  patient profile — identifiers and a dated timeline of confirmed
 *  assessments, photo checks and lab results, with the latest measurements. */
export default function PatientResultsPage() {
  const { t, lang } = useI18n();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [vitals, setVitals] = useState<PatientVitals[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ predictions: PredictionRow[]; scans: ScanRow[] }>("/api/records/me"),
      api<{ vitals: PatientVitals[] }>("/api/records/me/vitals").catch(() => ({ vitals: [] as PatientVitals[] })),
      api<{ profile: MeProfile }>("/api/me").catch(() => null),
    ])
      .then(([records, v, m]) => {
        setPredictions(records.predictions);
        setScans(records.scans);
        setVitals(v.vitals);
        setMe(m?.profile ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")))
      .finally(() => setLoading(false));
  }, [t]);

  const events = useMemo(() => {
    const items: TimelineItem[] = [
      // only assessments the doctor confirmed reach this list (backend)
      ...predictions.map((p) => {
        const status = clinicalStatusOf(p);
        return {
          key: `p-${p.id}`,
          at: p.created_at,
          title: t("pt.res.ev.m1"),
          text: t("pt.res.ev.m1Text", { result: t(`clinical.${status}`), doctor: p.doctor?.full_name ?? "—" }),
          status,
          href: `/predictions/${p.id}`,
        };
      }),
      ...scans.map((s) => ({
        key: `s-${s.id}`,
        at: s.created_at,
        title: t(`pt.res.ev.${s.scan_type}`),
        text:
          s.result?.label != null
            ? `${s.result.label}${s.result.confidence != null ? ` (${(s.result.confidence * 100).toFixed(0)} %)` : ""}`
            : "—",
      })),
      ...vitals.map((v) => ({
        key: `v-${v.id}`,
        at: v.measured_at,
        title: t("pt.res.ev.lab"),
        text: [
          v.hba1c != null ? `HbA1c ${v.hba1c} %` : null,
          v.fasting_glucose != null ? `${t("pt.v.glucose")} ${v.fasting_glucose} mg/dL` : null,
          v.systolic != null ? `${t("pt.v.bp")} ${v.systolic}/${v.diastolic ?? "—"} mmHg` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      })),
      ...(me?.created_at ? [{ key: "joined", at: me.created_at, title: t("pt.res.ev.joined"), text: t("pt.res.ev.joinedText") }] : []),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [predictions, scans, vitals, me, t]);

  if (loading) return <div className="h-40 animate-pulse rounded-2xl border border-pt-border bg-white" />;

  const info: [string, string | null | undefined][] = [
    [t("pt.res.dob"), me?.dob ? new Date(me.dob).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : null],
    [t("pt.res.sex"), me?.sex ? t(me.sex === "male" ? "common.male" : "common.female") : null],
    [t("pt.res.blood"), me?.blood_group],
    [t("pt.res.phone"), me?.phone],
    [t("pt.res.email"), me?.email],
    [t("pt.res.cnas"), me?.cnas_number],
    [t("pt.res.chifa"), me?.chifa_number],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold leading-[1.15] text-pt-ink">{t("pt.res.title")}</h1>
        <p className="text-[13px] text-pt-muted">{t("pt.res.subtitle")}</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className={card}>
            <CardTitle icon={IdCard} title={t("pt.res.info")} />
            <dl className="flex flex-col">
              {info.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-pt-border py-2.5 last:border-b-0">
                  <dt className="text-sm text-pt-muted">{label}</dt>
                  <dd className="text-right text-sm font-semibold text-pt-ink">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-pt-muted">{t("pt.res.infoNote")}</p>
          </div>

          <div className={card}>
            <CardTitle icon={FileHeart} title={t("pt.res.timeline")} />
            {events.length === 0 && <p className="rounded-xl border border-dashed border-pt-border p-6 text-center text-sm text-pt-muted">{t("pt.res.empty")}</p>}
            <ol className="flex flex-col">
              {events.map((e, i) => (
                <li key={e.key} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < events.length - 1 && <span className="absolute bottom-0 left-[5px] top-4 w-px bg-pt-border" aria-hidden />}
                  <span className="z-10 mt-1.5 size-[11px] shrink-0 rounded-full bg-pt-primary" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[15px] font-bold text-pt-ink">{e.title}</p>
                      <p className="text-xs text-pt-muted">{shortDate(e.at, lang)}</p>
                    </div>
                    <p className="text-sm text-pt-muted">{e.text}</p>
                    {(e.status || e.href) && (
                      <div className="flex flex-wrap items-center gap-3">
                        {e.status && <ClinicalBadge status={e.status} withIcon />}
                        {e.href && (
                          <Link href={e.href} className="flex items-center gap-1 text-xs font-semibold text-pt-primary hover:underline">
                            {t("pt.home.openReport")}
                            <ChevronRight size={14} />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className={card}>
            <CardTitle icon={Stethoscope} title={t("pt.res.measures")} />
            <VitalsTiles vitals={vitals[0]} />
            <p className="text-xs text-pt-muted">{t("pt.res.measuresNote")}</p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-pt-deep p-5">
            <p className="text-base font-bold text-white">{t("pt.res.checks")}</p>
            <p className="text-xs text-white/72">{t("pt.res.checksDesc")}</p>
            {(
              [
                ["/patient/foot", Footprints, "pt.home.act.foot"],
                ["/patient/neck", ScanFace, "pt.home.act.neck"],
                ["/chat", MessageCircle, "pt.home.act.chat"],
              ] as const
            ).map(([href, IconCmp, key]) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-xl bg-white/[0.09] px-4 py-3 text-sm font-semibold text-white hover:bg-white/15">
                <IconCmp size={18} />
                <span className="flex-1">{t(key)}</span>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
