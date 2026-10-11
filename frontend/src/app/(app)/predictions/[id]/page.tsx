"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, FileText, Shield } from "lucide-react";

import ClinicalBadge from "@/components/ClinicalBadge";
import RiskGauge from "@/components/RiskGauge";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { clinicalStatusOf, shortId } from "@/lib/clinical";
import { formatDateTime } from "@/lib/format";
import {
  STATUS_BADGE,
  downloadReport,
  formatNumber,
  formatPct,
  tierKey,
} from "@/lib/prediction";
import type { ClinicalValue, PredictionReport, ReviewStatus } from "@/lib/types";

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

  const status = clinicalStatusOf(p);
  const confidence = Math.max(p.probability, 1 - p.probability);
  const FACTOR_COLORS = ["bg-status-critical", "bg-status-prediabetes", "bg-brand-teal", "bg-status-insufficient", "bg-slate-400"];
  const valueTone = (v: ClinicalValue | undefined) =>
    !v ? "text-slate-900" : v.status === "high" || v.status === "elevated" ? "text-status-critical" : "text-slate-900";
  const missingSecondary = !values.get("bmi");

  return (
    <div className="flex flex-col gap-6">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-brand">
        <ArrowLeft size={14} />
        {canReview ? t("report.backToPatient") : t("pt.nav.results")}
      </Link>

      {/* Patient-Context-Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-[13px] text-slate-500">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[10px] font-bold text-slate-600">
            {initials(patient.full_name)}
          </span>
          <span className="text-[15px] font-bold text-slate-900">{patient.full_name ?? "—"}</span>
          <span className="h-2.5 w-px bg-slate-200" aria-hidden />
          <span>
            {t(p.input.gender === "male" ? "common.male" : "common.female")}, {formatNumber(p.input.age, lang)} {t("common.years")}
          </span>
          <span className="h-2.5 w-px bg-slate-200" aria-hidden />
          <span>
            ID: <span className="font-mono">PT-{shortId(p.patient_id)}</span>
          </span>
          <span className="h-2.5 w-px bg-slate-200" aria-hidden />
          <span>
            {t("report.assessed")}: <span className="font-mono">{formatDateTime(p.created_at, lang)}</span>
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[p.status]}`}>{t(`status.${p.status}`)}</span>
          <span className="text-[13px] text-slate-500">{t("report.riskStatus")}</span>
          <ClinicalBadge status={status} withIcon />
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("report.title")}</h1>
        <p className="text-sm text-slate-500">{t("report.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left-Col-Gauge */}
        <section className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col items-center gap-4">
            <h2 className="text-[15px] font-bold text-slate-700">{t("report.riskLevel")}</h2>
            <div className="w-full max-w-[300px]">
              <RiskGauge
                probability={p.probability}
                threshold={p.threshold}
                label={`${t("report.probability")}: ${formatPct(p.probability, lang)}`}
              />
            </div>
            <p className="font-mono text-3xl font-bold text-slate-900">{formatPct(p.probability, lang)}</p>
            <span
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold uppercase ${
                diabetic ? "bg-[#fee2e2] text-status-critical" : tier === "prediabetic" ? "bg-[#fef3c7] text-status-prediabetes" : "bg-[#dcfce7] text-status-normal"
              }`}
            >
              <CircleAlert size={16} />
              {t(`tier.${tier}`)} : {t(diabetic ? "result.diabetic" : "result.nonDiabetic")}
            </span>
          </div>
          <div className="h-px bg-slate-200" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-semibold text-slate-700">{t("report.confidence")}</span>
              <span className="font-mono text-sm font-bold text-brand">{formatPct(confidence, lang)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-brand" style={{ width: `${confidence * 100}%` }} />
            </div>
            {p.threshold != null && (
              <p className="text-xs text-slate-400">{t("report.threshold", { pct: formatPct(p.threshold, lang) })}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{t("report.interpretation")}</h3>
              {canReview && p.interpretation && !interpBusy && (
                <button onClick={() => interpret(true)} className="text-xs font-semibold text-brand hover:underline">
                  ↻ {t("report.regenerate")}
                </button>
              )}
            </div>
            {interpBusy ? (
              <div className="space-y-2" aria-live="polite">
                <p className="text-xs text-slate-400">{t("report.generating")}</p>
                <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
              </div>
            ) : interpError ? (
              <p className="text-[13px] text-red-600">
                {t("report.interpretationFailed", { error: interpError })}{" "}
                <button onClick={() => interpret(false)} className="font-semibold underline">
                  {t("report.retry")}
                </button>
              </p>
            ) : p.interpretation ? (
              <>
                <p className="text-[13px] leading-[1.5] text-slate-700">{p.interpretation}</p>
                <p className="text-[11px] text-slate-400">{t("report.aiNote")}</p>
              </>
            ) : (
              <p className="text-[13px] text-slate-400">{t("report.noInterpretation")}</p>
            )}
          </div>
        </section>

        {/* Right-Col-Details */}
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">{t("report.values")}</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              {p.values.map((v) => (
                <div key={v.key} className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
                  <dt className="text-slate-500">{t(`feature.${v.key}`)}</dt>
                  <dd className={`text-right font-mono font-bold ${valueTone(v)}`}>
                    {valueText(v)}
                    {v.status !== "normal" && <span className="block font-sans text-[11px] font-medium">{flagText(v)}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t("report.factors")}</h2>
              <p className="text-[11px] text-slate-400">{t("report.factorsHint")}</p>
            </div>
            <ol className="flex flex-col gap-3">
              {factors.map((f, i) => {
                const up = f.value > 0;
                return (
                  <li key={f.feature} className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-700">
                        {i + 1}. {t(`feature.${f.feature}`)}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-bold text-slate-500">
                        {valueText(values.get(f.feature))} · {up ? "+" : "−"}
                        {formatNumber(Math.abs(f.value), lang)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-sm bg-slate-200">
                      <div
                        className={`h-full ${up ? FACTOR_COLORS[i] ?? "bg-slate-400" : "bg-status-normal"}`}
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

      {/* Banner-Group */}
      <div className="flex flex-col gap-3">
        {missingSecondary && (
          <p className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-[#fef3c7] p-3 text-[13px] font-semibold text-status-prediabetes">
            <CircleAlert size={16} className="shrink-0" />
            {t("report.uncertain")}
          </p>
        )}
        <p className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-100 p-3 text-[13px] text-slate-700">
          <Shield size={16} className="shrink-0 text-slate-500" />
          <span>
            <strong className="font-bold">{t("report.disclaimerTitle")}</strong> {t("report.disclaimer")}
          </span>
        </p>
      </div>

      {/* review state */}
      {reviewed && !editing && (
        <div
          className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            p.status === "confirmed" ? "border-[#bbf7d0] bg-[#dcfce7] text-[#166534]" : "border-[#fca5a5] bg-[#fef2f2] text-status-critical"
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
            <button onClick={() => setEditing(true)} className="text-xs font-semibold underline underline-offset-2">
              {t("report.changeDecision")}
            </button>
          )}
        </div>
      )}

      {showActions && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-700">{t("report.note")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={t("report.notePlaceholder")}
            className="rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          {!reviewed && <span className="text-xs text-slate-400">{t("report.pendingDesc")}</span>}
        </label>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {/* Action-Buttons-Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {showActions && (
            <button
              onClick={() => review("confirmed")}
              disabled={saving !== null}
              className="rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving === "confirmed" ? t("auth.working") : t("report.confirm")}
            </button>
          )}
          {canReview && (
            <button
              onClick={() => router.push(`/doctor/diabetes?from=${p.id}`)}
              className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("report.modify")}
            </button>
          )}
          {showActions && (
            <button
              onClick={() => review("rejected")}
              disabled={saving !== null}
              className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-6 py-3 text-sm font-semibold text-status-critical hover:bg-[#fee2e2] disabled:opacity-50"
            >
              {saving === "rejected" ? t("auth.working") : t("report.reject")}
            </button>
          )}
          {showActions && editing && (
            <button
              onClick={() => {
                setEditing(false);
                setNote(p.review_note ?? "");
              }}
              className="px-3 py-3 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportPdf}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText size={14} />
            {exporting ? t("report.exporting") : t("report.export")}
          </button>
          <Link href={backHref} className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
            {canReview ? t("report.toRecord") : t("pt.nav.results")}
          </Link>
        </div>
      </div>
    </div>
  );
}
