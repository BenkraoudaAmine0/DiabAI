"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { PredictionRow, ScanRow } from "@/lib/types";

const TIER_STYLES: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Moderate: "bg-amber-100 text-amber-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
  "Prediabetic ⚠️": "bg-yellow-100 text-yellow-800",
};

const SCAN_ICONS: Record<string, string> = { foot: "🦶", neck: "🧣", eye: "👁" };

export default function PatientHistoryPage() {
  const { t, lang } = useI18n();
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ predictions: PredictionRow[]; scans: ScanRow[] }>("/api/records/me")
      .then((r) => {
        setPredictions(r.predictions);
        setScans(r.scans);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">{t("common.loading")}</p>;

  const fmt = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("history.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("history.subtitle")}</p>
      </div>

      {predictions.length === 0 && scans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {t("history.empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {predictions.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    🩺 {t("nav.diabetes")}
                  </p>
                  <p className="text-xl font-bold text-slate-900">
                    {((p.probability ?? 0) * 100).toFixed(1)}%{" "}
                    <span className="text-sm font-semibold text-slate-600">
                      {(p.prediction ?? 0) === 1 ? "🔴 Diabetic" : "🟢 Non-Diabetic"}
                    </span>
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    TIER_STYLES[p.risk_tier ?? ""] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {p.risk_tier}
                </span>
              </div>
              {p.waterfall_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.waterfall_url}
                  alt="SHAP explanation"
                  className="mt-3 w-full rounded-xl border border-slate-100"
                />
              )}
              <p className="mt-3 text-xs text-slate-400">
                {t("history.doctor")}: {p.doctor?.full_name ?? "—"} · {fmt(p.created_at)}
              </p>
            </div>
          ))}

          {scans.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {SCAN_ICONS[s.scan_type]} {t(`scan.${s.scan_type}.title`)}
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {s.result?.label ?? "—"}{" "}
                {s.result?.confidence != null && (
                  <span className="text-sm font-semibold text-slate-500">
                    ({(s.result.confidence * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
              {s.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.image_url}
                  alt={s.scan_type}
                  className="mt-3 max-h-56 rounded-xl border border-slate-100 object-contain"
                />
              )}
              <p className="mt-3 text-xs text-slate-400">{fmt(s.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
