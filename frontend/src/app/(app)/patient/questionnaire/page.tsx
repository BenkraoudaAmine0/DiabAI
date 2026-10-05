"use client";

import { useState } from "react";
import { Check, ListChecks, MessageCircleHeart, Sparkles, Stethoscope } from "lucide-react";

import ConsultDoctorDialog from "@/components/patient/ConsultDoctorDialog";
import { useI18n } from "@/i18n";

type Answer = "yes" | "no";

// Figma "Risk questionnaire" (122:17042) — 6 general risk factors
const RISK_QUESTIONS = ["age", "family", "inactive", "bloodPressure", "pregnancy", "thirst"] as const;
// Figma "Check your symptoms" (122:16904) — 0–1 yes = low concern, 2+ = consult
const SYMPTOMS = ["thirst", "urination", "fatigue", "vision", "wounds"] as const;
const CONSULT_AT = 2; // same threshold for both checks

const MAPS_SEARCH = "https://www.google.com/maps/search/";

/** Two Figma "Answer" buttons: selected #0b6b5f, idle #eaf5f1. */
function RiskAnswers({
  value,
  onChange,
}: {
  value: Answer | undefined;
  onChange: (a: Answer) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex w-full gap-3">
      {(["yes", "no"] as const).map((a) => {
        const on = value === a;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(a)}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
              on
                ? "border-pt-primary bg-pt-primary text-white"
                : "border-pt-border bg-pt-mint-soft text-pt-muted hover:border-pt-primary/40"
            }`}
          >
            {t(a === "yes" ? "pt.q.yes" : "pt.q.no")}
          </button>
        );
      })}
    </div>
  );
}

/** Figma symptom "Toggle": #f7faf9 track, the chosen half #e4f5ee / #126847. */
function SymptomToggle({
  value,
  onChange,
}: {
  value: Answer | undefined;
  onChange: (a: Answer) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-10 w-full gap-1 rounded-lg bg-[#f7faf9] p-[3px]">
      {(["yes", "no"] as const).map((a) => {
        const on = value === a;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(a)}
            className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-md text-sm font-semibold transition-colors ${
              on ? "bg-[#e4f5ee] text-[#126847]" : "text-[#879993] hover:text-[#126847]"
            }`}
          >
            {t(a === "yes" ? "pt.q.yes" : "pt.q.no")}
          </button>
        );
      })}
    </div>
  );
}

export default function QuestionnairePage() {
  const { t } = useI18n();
  const [risk, setRisk] = useState<Record<string, Answer>>({});
  const [symptoms, setSymptoms] = useState<Record<string, Answer>>({});
  const [showSymptomResult, setShowSymptomResult] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);

  const answered = RISK_QUESTIONS.filter((q) => risk[q]).length;
  const pct = Math.round((answered / RISK_QUESTIONS.length) * 100);
  const riskYes = RISK_QUESTIONS.filter((q) => risk[q] === "yes").length;
  const riskDone = answered === RISK_QUESTIONS.length;

  const symptomsDone = SYMPTOMS.every((s) => symptoms[s]);
  const symptomYes = SYMPTOMS.filter((s) => symptoms[s] === "yes").length;
  const symptomHigh = symptomYes >= CONSULT_AT;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Risk questionnaire ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-bold leading-[1.15] text-pt-ink">{t("pt.q.title")}</h1>
        <p className="text-base leading-[1.45] text-pt-muted">{t("pt.q.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between text-xs">
          <span className="font-semibold text-pt-primary">
            {t("pt.q.answered", { n: answered, total: RISK_QUESTIONS.length })}
          </span>
          <span className="text-pt-muted">{pct}%</span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-pt-mint"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-pt-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {RISK_QUESTIONS.map((q) => (
          <div key={q} className="flex flex-col gap-4 rounded-2xl border border-pt-border bg-white p-5">
            <p className="text-base font-medium leading-[1.4] text-pt-ink">{t(`pt.q.${q}`)}</p>
            <RiskAnswers value={risk[q]} onChange={(a) => setRisk((r) => ({ ...r, [q]: a }))} />
          </div>
        ))}
      </div>

      {riskDone &&
        (riskYes >= CONSULT_AT ? (
          <div className="flex flex-col gap-5 rounded-[20px] border border-[#e7c3be] bg-[#fbe9e6] p-6 sm:flex-row sm:items-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white text-[#9a3b32]">
              <Stethoscope size={28} strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[0.5px] text-[#9a3b32]">{t("pt.q.yourResult")}</p>
              <p className="text-[28px] font-bold text-pt-ink">{t("pt.q.consult")}</p>
              <p className="text-sm text-pt-muted">{t("pt.q.disclaimer")}</p>
            </div>
            <button
              type="button"
              onClick={() => setConsultOpen(true)}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#9a3b32] px-5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Stethoscope size={18} />
              {t("pt.s.consult")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 rounded-[20px] border border-[#c8dad3] bg-[#e4f5ee] p-6 sm:flex-row sm:items-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white text-[#126847]">
              <Check size={28} strokeWidth={2} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[0.5px] text-[#126847]">{t("pt.q.yourResult")}</p>
              <p className="text-[28px] font-bold text-pt-ink">{t("pt.q.low")}</p>
              <p className="text-sm text-pt-muted">{t("pt.q.disclaimer")}</p>
            </div>
          </div>
        ))}

      {/* ── Check your symptoms ────────────────────────────────────────── */}
      <section className="mt-4 flex flex-col">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#dde9e4] bg-white px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-[32px] font-bold leading-10 text-[#17352d]">{t("pt.s.title")}</h2>
            <p className="text-[15px] leading-[22px] text-[#60756e]">{t("pt.s.subtitle")}</p>
          </div>
          <button
            type="button"
            disabled={!symptomsDone}
            onClick={() => setShowSymptomResult(true)}
            title={symptomsDone ? undefined : t("pt.s.answerAll")}
            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1d8a63] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={18} />
            {t("pt.s.seeResult")}
          </button>
        </div>

        <div className="flex flex-col gap-8 pt-10">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e4f5ee] text-[#126847]">
              <ListChecks size={20} />
            </span>
            <p className="text-base leading-6 text-[#60756e]">{t("pt.s.prompt")}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SYMPTOMS.map((s) => (
              <div key={s} className="flex flex-col gap-4 rounded-2xl border border-[#dde9e4] bg-white p-5">
                <p className="text-base font-semibold text-[#17352d]">{t(`pt.s.${s}`)}</p>
                <SymptomToggle
                  value={symptoms[s]}
                  onChange={(a) => {
                    setSymptoms((m) => ({ ...m, [s]: a }));
                    setShowSymptomResult(false);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-xs font-bold uppercase tracking-[0.7px] text-[#879993]">{t("pt.s.guidance")}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div
                className={`flex items-center gap-4 rounded-2xl border border-[#c8dad3] bg-[#e4f5ee] p-4 transition-opacity ${
                  showSymptomResult && symptomHigh ? "opacity-40" : ""
                } ${showSymptomResult && !symptomHigh ? "ring-2 ring-[#1d8a63]" : ""}`}
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-[#126847]">
                  <Check size={24} />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-semibold text-[#126847]">{t("pt.s.lowRange")}</p>
                  <p className="text-lg font-bold text-[#17352d]">{t("pt.s.lowTitle")}</p>
                  <p className="text-sm text-[#60756e]">{t("pt.s.lowText")}</p>
                </div>
              </div>

              <div
                className={`flex flex-col gap-4 rounded-2xl border border-[#f1d28d] bg-[#fff3d6] p-5 shadow-[0_4px_7px_rgba(21,63,48,0.06)] transition-opacity ${
                  showSymptomResult && !symptomHigh ? "opacity-40" : ""
                } ${showSymptomResult && symptomHigh ? "ring-2 ring-[#a85e06]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-[#a85e06]">
                    {t("pt.s.highRange")}
                  </span>
                  <MessageCircleHeart size={18} className="text-[#a85e06]" />
                </div>
                <p className="text-sm font-semibold leading-5 text-[#17352d]">{t("pt.s.highText")}</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConsultOpen(true)}
                    className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1d8a63] px-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    <Stethoscope size={18} />
                    {t("pt.s.consult")}
                  </button>
                  <a
                    href={`${MAPS_SEARCH}${encodeURIComponent(t("pt.s.findClinic") + " diabète")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-[#126847] underline"
                  >
                    {t("pt.s.findClinic")}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 border-t border-[#dde9e4] pt-5 text-center text-xs font-medium text-[#60756e]">
          {t("pt.s.footer")}
        </p>
      </section>

      {consultOpen && <ConsultDoctorDialog onClose={() => setConsultOpen(false)} />}
    </div>
  );
}
