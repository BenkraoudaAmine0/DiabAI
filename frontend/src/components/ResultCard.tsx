"use client";

import { useI18n } from "@/i18n";
import type { PredictionResult, TopFactor } from "@/lib/types";

const TIER_STYLES: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Moderate: "bg-amber-100 text-amber-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
  "Prediabetic ⚠️": "bg-yellow-100 text-yellow-800",
};

const FEATURE_LABELS: Record<string, string> = {
  gender: "Gender",
  age: "Age",
  hypertension: "Hypertension",
  heart_disease: "Heart disease",
  smoking_history: "Smoking",
  bmi: "BMI",
  HbA1c_level: "HbA1c",
  blood_glucose_level: "Blood glucose",
};

function FactorRow({ factor }: { factor: TopFactor }) {
  const { t } = useI18n();
  const up = factor.direction.includes("↑");
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-700">
        {FEATURE_LABELS[factor.feature] ?? factor.feature}
      </span>
      <span className="flex items-center gap-2 text-xs">
        <span
          className={`rounded px-1.5 py-0.5 font-semibold ${
            up ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {factor.direction}
        </span>
        <span className="text-slate-500">
          {t(up ? "result.riskUp" : "result.riskDown")} {t("result.by")}{" "}
          <strong>+{Math.abs(factor.value).toFixed(3)}</strong>
        </span>
      </span>
    </li>
  );
}

export default function ResultCard({
  result,
  onNew,
}: {
  result: PredictionResult;
  onNew?: () => void;
}) {
  const { t } = useI18n();
  const diabetic = result.prediction === 1;

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("result.score")}
          </p>
          <p className="text-5xl font-bold tracking-tight text-slate-900">
            {result.probability_pct}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${
              diabetic ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {result.result_label}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              TIER_STYLES[result.risk_tier] ?? "bg-slate-100 text-slate-600"
            }`}
          >
            {t("result.tier")}: {result.risk_tier}
          </span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          {t("result.factors")}
        </p>
        <ul className="space-y-2">
          {result.top_factors.map((f) => (
            <FactorRow key={f.feature} factor={f} />
          ))}
        </ul>
      </div>

      {result.waterfall_url && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            {t("result.waterfall")}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.waterfall_url}
            alt={t("result.waterfall")}
            className="w-full rounded-xl border border-slate-100"
          />
        </div>
      )}

      {onNew && (
        <button
          onClick={onNew}
          className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {t("result.new")}
        </button>
      )}
    </div>
  );
}
