"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import PredictionCard from "@/components/PredictionCard";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { PredictionRow, ScanRow } from "@/lib/types";

interface PanelPatientInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  dob: string | null;
  sex: string | null;
  phone: string | null;
}

interface RecordsResponse {
  patient: PanelPatientInfo;
  predictions: PredictionRow[];
  scans: ScanRow[];
}

const SCAN_ICONS: Record<string, string> = { foot: "🦶", neck: "🧣", eye: "👁" };

function fmtDate(iso: string | null | undefined, lang: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, lang } = useI18n();
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<RecordsResponse>(`/api/patients/${id}/records`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [id, t]);

  if (error) {
    return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
  }

  const { patient, predictions, scans } = data;

  // merged timeline
  const events: {
    key: string;
    at: string;
    node: React.ReactNode;
  }[] = [
    ...predictions.map((p) => ({
      key: `pred-${p.id}`,
      at: p.created_at,
      node: <PredictionCard prediction={p} />,
    })),
    ...scans.map((s) => ({
      key: `scan-${s.id}`,
      at: s.created_at,
      node: (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {SCAN_ICONS[s.scan_type]} {t(`scan.${s.scan_type}.title`)}
              </p>
              <p className="text-xl font-bold text-slate-900">
                {s.result?.label ?? "—"}{" "}
                {s.result?.confidence != null && (
                  <span className="text-sm font-semibold text-slate-500">
                    ({(s.result.confidence * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
          </div>
          {s.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.image_url}
              alt={s.scan_type}
              className="mt-3 max-h-56 rounded-xl border border-slate-100 object-contain"
            />
          )}
          <p className="mt-3 text-xs text-slate-400">{fmtDate(s.created_at, lang)}</p>
        </div>
      ),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-6">
      <Link
        href="/doctor/patients"
        className="text-sm font-semibold text-teal-600"
      >
        ← {t("patients.title")}
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-lg font-bold text-teal-700">
            {(patient.full_name ?? "?")
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {patient.full_name ?? "—"}
            </h1>
            <p className="text-sm text-slate-500">{patient.email}</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {patient.dob && (
            <div>
              <dt className="text-xs text-slate-400">{t("common.dob")}</dt>
              <dd className="font-medium text-slate-700">{patient.dob}</dd>
            </div>
          )}
          {patient.sex && (
            <div>
              <dt className="text-xs text-slate-400">{t("common.sex")}</dt>
              <dd className="font-medium text-slate-700">
                {t(patient.sex === "male" ? "common.male" : "common.female")}
              </dd>
            </div>
          )}
          {patient.phone && (
            <div>
              <dt className="text-xs text-slate-400">{t("common.phone")}</dt>
              <dd className="font-medium text-slate-700">{patient.phone}</dd>
            </div>
          )}
        </dl>
      </div>

      <h2 className="text-lg font-bold text-slate-900">
        {t("history.subtitle")}
      </h2>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {t("history.empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((e) => (
            <div key={e.key}>{e.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}
