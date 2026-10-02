"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import RiskGauge from "@/components/RiskGauge";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  STATUS_BADGE,
  TIER_BADGE,
  downloadReport,
  formatNumber,
  formatPct,
  tierKey,
} from "@/lib/prediction";
import type { ClinicalValue, PredictionReport, ReviewStatus } from "@/lib/types";

const VALUE_COLOR: Record<ClinicalValue["status"], string> = {
  normal: "text-slate-900",
  elevated: "text-amber-600",
  high: "text-red-600",
};

const YES_NO_KEYS = ["hypertension", "heart_disease", "smoking_history"];
const SMOKING_KEYS: Record<string, string> = {
  never: "common.never",
  "No Info": "common.noInfo",
  current: "common.current",
  former: "common.former",
  ever: "common.former",
  "not current": "common.former",
};

function initials(name: string | null | undefined): string {
  return (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Diabetes prediction report: gauge, entered values, SHAP factors, Gemini's
 *  clinical interpretation, and the doctor's confirm / reject / PDF actions.
 *  Patients see their confirmed reports read-only. */
export default function PredictionReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, lang } = useI18n();
  const router = useRouter();

  const [data, setData] = useState<PredictionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interpBusy, setInterpBusy] = useState(false);
  const [interpError, setInterpError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<ReviewStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    api<PredictionReport>(`/api/diabetes/predictions/${id}`)
      .then((r) => {
        setData(r);
        setNote(r.prediction.review_note ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [id, t]);

  const interpret = useCallback(
    async (force: boolean) => {
      setInterpBusy(true);
      setInterpError(null);
      try {
        const r = await api<{ interpretation: string; lang: "en" | "fr" }>(
          `/api/diabetes/predictions/${id}/interpretation`,
          { method: "POST", body: JSON.stringify({ lang, force }) }
        );
        setData((d) =>
          d
            ? {
                ...d,
                prediction: {
                  ...d.prediction,
                  interpretation: r.interpretation,
                  interpretation_lang: r.lang,
                },
              }
            : d
        );
      } catch (e) {
        setInterpError(e instanceof Error ? e.message : t("common.error"));
      } finally {
        setInterpBusy(false);
      }
    },
    [id, lang, t]
  );

  // doctors: write the interpretation once per language (stored server-side)
  const canReview = data?.can_review ?? false;
  const storedLang = data?.prediction.interpretation_lang;
  const hasText = Boolean(data?.prediction.interpretation);
  useEffect(() => {
    if (!data || !canReview) return;
    if (hasText && storedLang === lang) return;
    const key = `${id}:${lang}`;
    if (requested.current === key) return; // StrictMode / re-render guard
    requested.current = key;
    interpret(false);
  }, [data, canReview, hasText, storedLang, lang, id, interpret]);

  async function review(decision: "confirmed" | "rejected") {
    setSaving(decision);
    setError(null);
    try {
      const r = await api<PredictionReport>(`/api/diabetes/predictions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      setData(r);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(null);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      await downloadReport(id, lang);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setExporting(false);
    }
  }

  if (!data) {
    return error ? (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
    ) : (
      <p className="text-sm text-slate-500">{t("common.loading")}</p>
    );
  }

  const { prediction: p, patient } = data;
  const tier = tierKey(p.risk_tier);
  const diabetic = p.prediction === 1;
  const values = new Map(p.values.map((v) => [v.key, v]));
  const factors = p.factors.slice(0, 5);
  const maxImpact = Math.max(...factors.map((f) => Math.abs(f.value)), 0.01);
  const reviewed = p.status !== "pending";
  const showActions = canReview && (!reviewed || editing);

  const valueText = (v: ClinicalValue | undefined): string => {
    if (!v) return "—";
    if (v.key === "gender") return t(v.value === "male" ? "common.male" : "common.female");
    if (typeof v.value === "boolean") return t(v.value ? "common.yes" : "common.no");
    if (v.key === "smoking_history") return t(SMOKING_KEYS[String(v.value)] ?? "common.never");
    if (v.key === "age") return `${formatNumber(Number(v.value), lang)} ${t("common.years")}`;
    return `${formatNumber(Number(v.value), lang)}${v.unit ? ` ${v.unit}` : ""}`;
  };
  const flagText = (v: ClinicalValue) =>
    v.status === "elevated" && YES_NO_KEYS.includes(v.key) ? t("flag.risk") : t(`flag.${v.status}`);

  const backHref = canReview ? `/doctor/patients/${p.patient_id}` : "/patient/history";

  return (
    <div className="space-y-5">
      <Link href={backHref} className="text-sm font-semibold text-teal-600">
        ← {canReview ? t("report.backToPatient") : t("history.title")}
      </Link>

      {/* patient bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">
            {initials(patient.full_name)}
          </span>
          <div>
            <p className="font-semibold text-slate-900">{patient.full_name ?? "—"}</p>
            <p className="text-xs text-slate-500">
              {t(p.input.gender === "male" ? "common.male" : "common.female")},{" "}
              {formatNumber(p.input.age, lang)} {t("common.years")}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          ID <span className="font-mono text-slate-700">{p.id.slice(0, 8).toUpperCase()}</span>
        </p>
        <p className="text-xs text-slate-500">
          {t("report.assessed")}: <span className="text-slate-700">{formatDateTime(p.created_at, lang)}</span>
        </p>
        {p.doctor_name && (
          <p className="text-xs text-slate-500">
            {t("report.requestedBy")}: <span className="text-slate-700">{p.doctor_name}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[p.status]}`}>
            {t(`status.${p.status}`)}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TIER_BADGE[tier]}`}>
            {t(`tier.${tier}`)}
          </span>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("report.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("report.subtitle")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ── left: risk + interpretation ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-center text-sm font-semibold text-slate-700">{t("report.riskLevel")}</h2>
          <div className="mt-3">
            <RiskGauge
              probability={p.probability}
              threshold={p.threshold}
              label={`${t("report.probability")}: ${formatPct(p.probability, lang)}`}
            />
          </div>
          <div className="mt-2 flex flex-col items-center gap-2 text-center">
            <p className="text-4xl font-bold tracking-tight text-slate-900">
              {formatPct(p.probability, lang)}
            </p>
            <p className={`text-sm font-semibold ${diabetic ? "text-red-600" : "text-emerald-600"}`}>
              {t(diabetic ? "result.diabetic" : "result.nonDiabetic")}
            </p>
            <span
              className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide ${TIER_BADGE[tier]}`}
            >
              {t(`tier.${tier}`)}
            </span>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{t("report.probability")}</span>
              <span className="font-semibold text-slate-900">{formatPct(p.probability, lang)}</span>
            </div>
            <div className="relative mt-2 h-2.5 rounded-full bg-slate-100">
              <div
                className={`h-2.5 rounded-full ${diabetic ? "bg-red-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.max(1, p.probability * 100)}%` }}
              />
              {p.threshold != null && (
                <span
                  className="absolute -top-1 h-4.5 w-0.5 bg-slate-800"
                  style={{ left: `${p.threshold * 100}%` }}
                  aria-hidden
                />
              )}
            </div>
            {p.threshold != null && (
              <p className="mt-1.5 text-xs text-slate-400">
                {t("report.threshold", { pct: formatPct(p.threshold, lang) })}
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{t("report.interpretation")}</h3>
              {canReview && p.interpretation && !interpBusy && (
                <button
                  onClick={() => interpret(true)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-800"
                >
                  ↻ {t("report.regenerate")}
                </button>
              )}
            </div>
            {interpBusy ? (
              <div className="mt-3 space-y-2" aria-live="polite">
                <p className="text-xs text-slate-400">{t("report.generating")}</p>
                <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
              </div>
            ) : interpError ? (
              <div className="mt-2 text-sm text-red-600">
                {t("report.interpretationFailed", { error: interpError })}{" "}
                <button onClick={() => interpret(false)} className="font-semibold underline">
                  {t("report.retry")}
                </button>
              </div>
            ) : p.interpretation ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{p.interpretation}</p>
                <p className="mt-3 text-xs text-slate-400">{t("report.aiNote")}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">{t("report.noInterpretation")}</p>
            )}
          </div>
        </section>

        {/* ── right: values + factors ── */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">{t("report.values")}</h2>
            <dl className="mt-3 divide-y divide-slate-100">
              {p.values.map((v) => (
                <div key={v.key} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-sm text-slate-600">
                    {t(`feature.${v.key}`)}
                    {["HbA1c_level", "blood_glucose_level", "bmi"].includes(v.key) && (
                      <span className="block text-[11px] text-slate-400">{t(`ref.${v.key}`)}</span>
                    )}
                  </dt>
                  <dd className="text-right">
                    <span className={`text-sm font-bold tabular-nums ${VALUE_COLOR[v.status]}`}>
                      {valueText(v)}
                    </span>
                    {v.status !== "normal" && (
                      <span className={`block text-[11px] font-medium ${VALUE_COLOR[v.status]}`}>
                        {flagText(v)}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">{t("report.factors")}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{t("report.factorsHint")}</p>
            <ol className="mt-3 space-y-3">
              {factors.map((f, i) => {
                const up = f.value > 0;
                return (
                  <li key={f.feature}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-slate-700">
                        {i + 1}. {t(`feature.${f.feature}`)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {valueText(values.get(f.feature))} ·{" "}
                        <strong className={up ? "text-red-600" : "text-emerald-600"}>
                          {up ? "+" : "−"}
                          {formatNumber(Math.abs(f.value), lang)}
                        </strong>
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${up ? "bg-red-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.max(4, (Math.abs(f.value) / maxImpact) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>

      {p.waterfall_url && (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            {t("report.technical")}
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.waterfall_url}
            alt={t("result.waterfall")}
            className="mx-auto mt-4 w-full max-w-3xl rounded-xl border border-slate-100"
          />
        </details>
      )}

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span aria-hidden>🛡 </span>
        <strong className="text-slate-800">{t("report.disclaimerTitle")}</strong> {t("report.disclaimer")}
      </p>

      {/* review state */}
      {reviewed && !editing && (
        <div
          className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            p.status === "confirmed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div>
            <p className="font-semibold">
              {p.reviewed_at
                ? t("report.reviewedBy", {
                    status: t(`status.${p.status}`),
                    name: p.reviewer_name ?? "—",
                    date: formatDateTime(p.reviewed_at, lang),
                  })
                : t(`status.${p.status}`)}
            </p>
            {canReview && <p className="mt-0.5 text-xs opacity-80">{t(`report.${p.status}Desc`)}</p>}
            {p.review_note && <p className="mt-2 whitespace-pre-wrap">{p.review_note}</p>}
          </div>
          {canReview && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold underline underline-offset-2"
            >
              {t("report.changeDecision")}
            </button>
          )}
        </div>
      )}

      {showActions && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t("report.note")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={t("report.notePlaceholder")}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          {!reviewed && <span className="mt-1 block text-xs text-slate-400">{t("report.pendingDesc")}</span>}
        </label>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
        {showActions && (
          <>
            <button
              onClick={() => review("confirmed")}
              disabled={saving !== null}
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {saving === "confirmed" ? t("auth.working") : t("report.confirm")}
            </button>
            <button
              onClick={() => review("rejected")}
              disabled={saving !== null}
              className="rounded-xl border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {saving === "rejected" ? t("auth.working") : t("report.reject")}
            </button>
            {editing && (
              <button
                onClick={() => {
                  setEditing(false);
                  setNote(p.review_note ?? "");
                }}
                className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                {t("common.cancel")}
              </button>
            )}
          </>
        )}
        {canReview && (
          <button
            onClick={() => router.push(`/doctor/diabetes?from=${p.id}`)}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("report.modify")}
          </button>
        )}
        <button
          onClick={exportPdf}
          disabled={exporting}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:ml-auto"
        >
          {exporting ? t("report.exporting") : `⤓ ${t("report.export")}`}
        </button>
      </div>
    </div>
  );
}
