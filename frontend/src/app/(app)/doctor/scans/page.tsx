"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Footprints, History, ScanFace, Shield } from "lucide-react";

import ScanReview from "@/components/doctor/ScanReview";
import PatientBar from "@/components/doctor/PatientBar";
import ScanUploader from "@/components/ScanUploader";
import { useModelAvailability } from "@/hooks/useModelAvailability";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/patient";
import { TONE_BADGE, confidencePct, scanLabel, scanTone, type PhotoScanType } from "@/lib/scans";
import type { PanelPatient, ScanRow } from "@/lib/types";

// the models' classes (vision_service SCAN_CONFIGS) when a row has no
// probabilities to read them from
const DEFAULT_LABELS: Record<PhotoScanType, string[]> = {
  foot: ["Abnormal(Ulcer)", "Normal(Healthy skin)"],
  neck: ["normal", "acanthosis_nigricans"],
};

function labelsOf(type: PhotoScanType, probabilities?: Record<string, number>): string[] {
  const keys = probabilities ? Object.keys(probabilities) : [];
  return keys.length > 0 ? keys : DEFAULT_LABELS[type];
}

/** Foot ulcer / neck acanthosis photo screening for a panel patient:
 *  upload & analyse, then confirm, correct or refer — also for the
 *  photos patients took themselves from their portal. */
function ScansPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const models = useModelAvailability();
  const [patients, setPatients] = useState<PanelPatient[] | null>(null);
  const [patientId, setPatientId] = useState("");
  const [type, setType] = useState<PhotoScanType>(params.get("type") === "neck" ? "neck" : "foot");
  const [wanted] = useState(() => params.get("patient")); // ?patient= on arrival
  // the photos loaded, tagged with the patient they belong to
  const [loaded, setLoaded] = useState<{ patientId: string; scans: ScanRow[] } | null>(null);

  useEffect(() => {
    api<{ patients: PanelPatient[] }>("/api/patients")
      .then((r) => {
        setPatients(r.patients);
        const pick = r.patients.find((p) => p.id === wanted) ?? r.patients[0];
        setPatientId((id) => id || pick?.id || "");
      })
      .catch(() => setPatients([]));
  }, [wanted]);

  const loadHistory = useCallback(() => {
    if (!patientId) return;
    api<{ scans: ScanRow[] }>(`/api/patients/${patientId}/records`)
      .then((r) => setLoaded({ patientId, scans: r.scans }))
      .catch(() => setLoaded({ patientId, scans: [] }));
  }, [patientId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // keep the choice in the URL so the page can be linked / reloaded
  useEffect(() => {
    if (!patientId) return;
    router.replace(`/doctor/scans?patient=${patientId}&type=${type}`, { scroll: false });
  }, [patientId, type, router]);

  if (patients === null) return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />;

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">{t("scan.noPatients")}</p>
        <Link href="/doctor/patients" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
          {t("nav.patients")}
        </Link>
      </div>
    );
  }

  const available = models?.[type];
  const history = loaded?.patientId === patientId ? loaded.scans : null;
  const rows = (history ?? []).filter((s) => s.scan_type === type);

  return (
    <div className="flex flex-col gap-6">
      <PatientBar patients={patients} patientId={patientId} onChange={setPatientId} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("scan.page.title")}</h1>
          <p className="text-sm text-slate-500">{t("scan.page.subtitle")}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1" role="tablist">
          {(
            [
              ["foot", Footprints],
              ["neck", ScanFace],
            ] as const
          ).map(([k, IconCmp]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={type === k}
              onClick={() => setType(k)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                type === k ? "bg-pt-mint text-brand" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <IconCmp size={16} />
              {t(`scan.${k}.title`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {available === false ? (
            <div className="flex items-start gap-3 rounded-xl border border-[#fde68a] bg-[#fef3c7] p-5">
              <CircleAlert size={20} className="mt-0.5 shrink-0 text-status-prediabetes" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-slate-900">{t("scan.unavailableTitle")}</p>
                <p className="text-sm text-slate-700">{t("scan.unavailableDoctor", { type })}</p>
              </div>
            </div>
          ) : (
            <ScanUploader
              key={`${type}-${patientId}`}
              scanType={type}
              patientId={patientId}
              onDone={loadHistory}
              renderAfterResult={(r) => (
                <ScanReview
                  scanId={r.scan_id}
                  options={labelsOf(type, r.probabilities)}
                  label={r.top_class ?? r.label}
                  onSaved={loadHistory}
                />
              )}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[15px] font-bold text-slate-900">{t("scan.lookFor")}</p>
            <p className="text-sm leading-[1.5] text-slate-600">{t(`scan.${type}.look`)}</p>
            <p className="text-sm leading-[1.5] text-slate-600">{t(`scan.${type}.desc`)}</p>
          </div>
          <p className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <Shield size={16} className="shrink-0 text-slate-500" />
            {t("scan.disclaimerDoctor")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <p className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
          <History size={18} className="text-brand" />
          {t("scan.history")}
        </p>
        {history === null && <div className="h-16 animate-pulse rounded-lg bg-slate-50" />}
        {history !== null && rows.length === 0 && <p className="text-sm text-slate-500">{t("scan.historyEmpty")}</p>}
        <ul className="flex flex-col divide-y divide-slate-200">
          {rows.map((s) => {
            const label = s.result?.label;
            const self = s.user_id === s.patient_id;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-4 py-3.5">
                {s.image_url ? (
                  <a href={s.image_url} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                    <img src={s.image_url} alt="" className="size-16 rounded-lg bg-slate-100 object-cover" />
                  </a>
                ) : (
                  <span className="size-16 shrink-0 rounded-lg bg-slate-100" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${TONE_BADGE[scanTone(label)]}`}>{scanLabel(t, label)}</span>
                    {confidencePct(s.result?.confidence) && (
                      <span className="font-mono text-xs text-slate-500">{confidencePct(s.result?.confidence)}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {shortDate(s.created_at, lang)} ·{" "}
                    {self ? t("scan.byPatient") : t("scan.byDoctor", { name: s.operator?.full_name ?? "—" })}
                  </p>
                </div>
                <ScanReview
                  compact
                  scanId={s.id}
                  options={labelsOf(type, s.result?.probabilities)}
                  label={s.result?.top_class ?? label}
                  decision={s}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function DoctorScansPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />}>
      <ScansPage />
    </Suspense>
  );
}
