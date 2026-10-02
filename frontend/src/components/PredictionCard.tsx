"use client";

import { useState } from "react";
import Link from "next/link";

import { useI18n } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import {
  STATUS_BADGE,
  TIER_BADGE,
  downloadReport,
  formatPct,
  tierKey,
} from "@/lib/prediction";
import type { PredictionRow } from "@/lib/types";

/** One diabetes prediction in a history timeline: score, tier, review
 *  status, the three strongest factors, and links to the report / PDF. */
export default function PredictionCard({
  prediction: p,
  showStatus = true,
}: {
  prediction: PredictionRow;
  showStatus?: boolean;
}) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tier = tierKey(p.risk_tier);
  const diabetic = p.prediction === 1;
  const status = p.status ?? "pending";

  async function pdf() {
    setBusy(true);
    setError(null);
    try {
      await downloadReport(p.id, lang);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            🩺 {t("nav.diabetes")}
          </p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">
            {formatPct(p.probability ?? 0, lang)}{" "}
            <span className={`text-sm font-semibold ${diabetic ? "text-red-600" : "text-emerald-600"}`}>
              {t(diabetic ? "result.diabetic" : "result.nonDiabetic")}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showStatus && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}>
              {t(`status.${status}`)}
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TIER_BADGE[tier]}`}>
            {t(`tier.${tier}`)}
          </span>
        </div>
      </div>

      {p.top_factors && p.top_factors.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {p.top_factors.slice(0, 3).map((f) => (
            <li key={f.feature} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
              {t(`feature.${f.feature}`)}{" "}
              <strong className={f.value > 0 ? "text-red-500" : "text-emerald-600"}>
                {f.value > 0 ? "↑" : "↓"}
              </strong>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {t("history.doctor")}: {p.doctor?.full_name ?? "—"} · {formatDateTime(p.created_at, lang)}
        </p>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button onClick={pdf} disabled={busy} className="text-slate-500 hover:text-slate-800 disabled:opacity-50">
            {busy ? t("report.exporting") : `⤓ PDF`}
          </button>
          <Link href={`/predictions/${p.id}`} className="text-teal-600 hover:text-teal-800">
            {t("report.open")} →
          </Link>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
