"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Shield } from "lucide-react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { initials, shortId } from "@/lib/clinical";
import type { PanelPatient, PredictionReport, PredictionResult } from "@/lib/types";

const FORMER_SMOKER = ["former", "ever", "not current"]; // one category in the model
const DRAFT_KEY = "diabai-m1-draft";

interface M1Form {
  gender: "male" | "female";
  age: string;
  weight: string;
  height: string;
  bmi: string; // used when weight/height are unknown (e.g. "modify inputs")
  glucose: string;
  hba1c: string;
  systolic: string;
  diastolic: string;
  familyHistory: boolean;
  gestationalHistory: boolean;
  heartDisease: boolean;
  knownHypertension: boolean;
  activity: "sedentary" | "low" | "moderate" | "active";
  smoking: string;
}

const EMPTY: M1Form = {
  gender: "female",
  age: "",
  weight: "",
  height: "",
  bmi: "",
  glucose: "",
  hba1c: "",
  systolic: "",
  diastolic: "",
  familyHistory: false,
  gestationalHistory: false,
  heartDisease: false,
  knownHypertension: false,
  activity: "moderate",
  smoking: "never",
};

/** Plausibility ranges (the API's hard limits are wider): outside them the
 *  field turns red as in the Figma "Validation Clinique" state. */
const PLAUSIBLE: Partial<Record<keyof M1Form, [number, number]>> = {
  age: [1, 110],
  weight: [20, 300],
  height: [100, 230],
  glucose: [40, 500],
  hba1c: [4, 15],
  systolic: [70, 250],
  diastolic: [40, 150],
};

function n(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : undefined;
}

function readDrafts(): Record<string, { form: M1Form; at: string }> {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeDraft(patientId: string, form: M1Form): string | null {
  try {
    const at = new Date().toISOString();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readDrafts(), [patientId]: { form, at } }));
    return at;
  } catch {
    return null;
  }
}

function clearDraft(patientId: string) {
  try {
    const all = readDrafts();
    delete all[patientId];
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function Field({
  label,
  unit,
  value,
  onChange,
  invalid,
  hint,
  mono = true,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className={`text-[13px] font-semibold ${invalid ? "text-status-critical" : "text-slate-900"}`}>{label}</span>
      <span
        className={`flex items-center justify-between gap-2 rounded-lg border p-3 focus-within:ring-2 ${
          invalid
            ? "border-status-critical bg-[#fef2f2] focus-within:ring-status-critical/20"
            : "border-slate-200 bg-slate-50 focus-within:border-brand focus-within:ring-brand/15"
        }`}
      >
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          className={`w-full min-w-0 bg-transparent text-sm font-semibold outline-none ${mono ? "font-mono" : ""} ${
            invalid ? "text-status-critical" : "text-slate-900"
          }`}
        />
        {invalid ? (
          <CircleAlert size={14} className="shrink-0 text-status-critical" />
        ) : (
          unit && <span className="shrink-0 text-xs text-slate-500">{unit}</span>
        )}
      </span>
      {invalid && hint && <span className="text-[11px] text-status-critical">{hint}</span>}
    </label>
  );
}

/** Figma "Toggle" (44×24) in a slate row. */
function SwitchRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-slate-50 p-3.5">
      <span className="text-[13px] font-semibold text-slate-900">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-7">
      <p className="text-[15px] font-bold uppercase text-brand">{title}</p>
      {children}
    </div>
  );
}

const selectCls =
  "w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

/** Figma 02 Doctor Screens · m1-assessment-form (2:1346). */
function DiabetesForm() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from"); // "Modify inputs" on a report
  const preselect = params.get("patient");
  const [patients, setPatients] = useState<PanelPatient[] | null>(null);
  const [patientId, setPatientId] = useState(preselect ?? "");
  const [form, setForm] = useState<M1Form>(EMPTY);
  const [draftAt, setDraftAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ patients: PanelPatient[] }>("/api/patients")
      .then((r) => {
        setPatients(r.patients);
        setPatientId((id) => id || r.patients[0]?.id || "");
      })
      .catch(() => setPatients([]));
  }, []);

  const patient = patients?.find((p) => p.id === patientId);

  // new patient selected → their saved draft, or age/sex from the profile
  useEffect(() => {
    if (!patientId || from) return;
    const draft = readDrafts()[patientId];
    const p = patients?.find((x) => x.id === patientId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- draft lives in localStorage
    setForm(
      draft?.form ?? {
        ...EMPTY,
        gender: p?.sex === "male" ? "male" : "female",
        age: p?.age != null ? String(p.age) : "",
      }
    );
    setDraftAt(draft?.at ?? null);
  }, [patientId, patients, from]);

  useEffect(() => {
    if (!from) return;
    api<PredictionReport>(`/api/diabetes/predictions/${from}`)
      .then(({ prediction: { input } }) => {
        setPatientId(input.patient_id);
        setForm({
          ...EMPTY,
          gender: input.gender === "male" ? "male" : "female",
          age: String(input.age),
          bmi: String(input.bmi),
          glucose: String(input.blood_glucose_level),
          hba1c: String(input.HbA1c_level),
          heartDisease: input.heart_disease,
          knownHypertension: input.hypertension,
          smoking: FORMER_SMOKER.includes(input.smoking_history)
            ? "former"
            : input.smoking_history === "No Info"
            ? "never"
            : input.smoking_history,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [from, t]);

  // auto-save the draft a moment after each change
  useEffect(() => {
    if (!patientId || form === EMPTY) return;
    const id = window.setTimeout(() => {
      const at = writeDraft(patientId, form);
      if (at) setDraftAt(at);
    }, 800);
    return () => window.clearTimeout(id);
  }, [form, patientId]);

  const set = <K extends keyof M1Form>(k: K) => (v: M1Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const bmi = useMemo(() => {
    const w = n(form.weight);
    const h = n(form.height);
    if (w && h) return Number((w / (h / 100) ** 2).toFixed(1));
    return n(form.bmi);
  }, [form.weight, form.height, form.bmi]);

  const invalid = (k: keyof M1Form) => {
    const v = n(form[k] as string);
    const r = PLAUSIBLE[k];
    return v != null && r != null && (v < r[0] || v > r[1]);
  };
  const anyInvalid = (Object.keys(PLAUSIBLE) as (keyof M1Form)[]).some(invalid);
  const hypertension =
    form.knownHypertension || (n(form.systolic) ?? 0) >= 140 || (n(form.diastolic) ?? 0) >= 90;
  const ready =
    !!patientId && n(form.age) != null && bmi != null && n(form.glucose) != null && n(form.hba1c) != null && !anyInvalid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || bmi == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<PredictionResult>("/api/diabetes/predict", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          gender: form.gender,
          age: n(form.age),
          hypertension,
          heart_disease: form.heartDisease,
          smoking_history: form.smoking,
          bmi,
          HbA1c_level: n(form.hba1c),
          blood_glucose_level: n(form.glucose),
        }),
      });
      // keep the measurements in the lab history too (needs migration 0012)
      const vitals = {
        fasting_glucose: n(form.glucose),
        hba1c: n(form.hba1c),
        systolic: n(form.systolic),
        diastolic: n(form.diastolic),
        weight_kg: n(form.weight),
        height_cm: n(form.height),
      };
      await api(`/api/patients/${patientId}/vitals`, { method: "POST", body: JSON.stringify(vitals) }).catch(() => null);
      clearDraft(patientId);
      router.push(`/predictions/${res.record_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setBusy(false);
    }
  }

  if (patients === null) return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />;

  if (patients.length === 0 && !error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{t("diabetes.noPatients")}</p>
        <button
          onClick={() => router.push("/doctor/patients")}
          className="mt-4 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          {t("patients.new")}
        </button>
      </div>
    );
  }

  const bmiLabel = bmi == null ? "" : bmi >= 30 ? t("pp.bmi.obese") : bmi >= 25 ? t("m1.over") : t("m1.normal");
  const bmiTone = bmi == null ? "" : bmi >= 30 ? "text-status-diabetes" : bmi >= 25 ? "text-status-prediabetes" : "text-status-normal";

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* Patient-Context-Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
            {initials(patient?.full_name ?? patient?.email)}
          </span>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            aria-label={t("m1.patient")}
            className="max-w-[260px] rounded-md bg-transparent text-[15px] font-bold text-slate-900 outline-none hover:bg-slate-50"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
          {patient && (
            <>
              <span className="h-2.5 w-px bg-slate-200" aria-hidden />
              <span className="text-[13px] text-slate-500">
                {patient.sex ? t(patient.sex === "male" ? "common.male" : "common.female") : "—"}
                {patient.age != null && `, ${t("common.ageShort", { n: patient.age })}`}
              </span>
              <span className="h-2.5 w-px bg-slate-200" aria-hidden />
              <span className="text-[13px] text-slate-500">
                ID: <span className="font-mono">PT-{shortId(patient.id).toUpperCase()}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Title-Header-Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("m1.title")}</h1>
          <p className="text-sm text-slate-500">{t("m1.subtitle")}</p>
        </div>
        {draftAt && (
          <span className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
            <span className="size-2 rounded-full bg-status-normal" />
            {t("m1.draft", {
              time: new Date(draftAt).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" }),
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <Section title={t("m1.s1")}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label={t("m1.age")} value={form.age} onChange={set("age")} invalid={invalid("age")} hint={t("m1.implausible")} mono={false} />
              <div className="flex min-w-0 flex-[2] flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-900">{t("common.sex")}</span>
                <div className="flex gap-3">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={form.gender === g}
                      onClick={() => set("gender")(g)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border p-3 text-[13px] ${
                        form.gender === g ? "border-brand bg-[#e6f4ea] font-bold text-brand" : "border-slate-200 font-medium text-slate-500"
                      }`}
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                          form.gender === g ? "border-2 border-brand" : "border-slate-200"
                        }`}
                      >
                        {form.gender === g && <span className="size-2 rounded-full bg-brand" />}
                      </span>
                      {t(g === "male" ? "m1.male" : "m1.female")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title={t("m1.s2")}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label={t("m1.weight")} unit="kg" value={form.weight} onChange={set("weight")} invalid={invalid("weight")} hint={t("m1.implausible")} mono={false} />
              <Field label={t("m1.height")} unit="cm" value={form.height} onChange={set("height")} invalid={invalid("height")} hint={t("m1.implausible")} mono={false} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-900">{t("m1.bmi")}</span>
                {n(form.weight) && n(form.height) ? (
                  <span className="flex items-center justify-between rounded-lg bg-slate-100 p-3">
                    <span className="font-mono text-sm font-bold text-slate-900">{bmi}</span>
                    <span className={`text-xs font-bold ${bmiTone}`}>{bmiLabel}</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-100 p-3">
                    <input
                      type="number"
                      step="any"
                      value={form.bmi}
                      onChange={(e) => set("bmi")(e.target.value)}
                      placeholder="—"
                      aria-label={t("m1.bmi")}
                      className="w-full min-w-0 bg-transparent font-mono text-sm font-bold text-slate-900 outline-none"
                    />
                    {bmi != null && <span className={`shrink-0 text-xs font-bold ${bmiTone}`}>{bmiLabel}</span>}
                  </span>
                )}
              </div>
            </div>
          </Section>

          <Section title={t("m1.s3")}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label={t("m1.glucose")} unit="mg/dL" value={form.glucose} onChange={set("glucose")} invalid={invalid("glucose")} hint={t("m1.implausibleGlucose")} />
              <Field label={t("m1.hba1c")} unit="%" value={form.hba1c} onChange={set("hba1c")} invalid={invalid("hba1c")} hint={t("m1.implausibleHba1c")} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-900">{t("m1.bp")}</span>
                <div className="flex gap-2">
                  {(["systolic", "diastolic"] as const).map((k) => (
                    <span
                      key={k}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-1 rounded-lg border p-3 ${
                        invalid(k) ? "border-status-critical bg-[#fef2f2]" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <input
                        type="number"
                        value={form[k]}
                        onChange={(e) => set(k)(e.target.value)}
                        aria-label={k === "systolic" ? t("pp.v.sys") : t("pp.v.dia")}
                        className="w-full min-w-0 bg-transparent font-mono text-sm font-semibold text-slate-900 outline-none"
                      />
                      <span className="text-[10px] text-slate-500">{k === "systolic" ? "SYS" : "DIA"}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title={t("m1.s4")}>
            <div className="flex flex-col gap-3">
              <SwitchRow label={t("m1.family")} on={form.familyHistory} onChange={set("familyHistory")} />
              <SwitchRow label={t("m1.gestational")} on={form.gestationalHistory} onChange={set("gestationalHistory")} />
              <SwitchRow label={t("m1.cvd")} on={form.heartDisease} onChange={set("heartDisease")} />
              <SwitchRow label={t("m1.hta")} on={form.knownHypertension} onChange={set("knownHypertension")} />
            </div>
          </Section>

          <Section title={t("m1.s5")}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-slate-900">
                {t("m1.activity")}
                <select className={selectCls} value={form.activity} onChange={(e) => set("activity")(e.target.value as M1Form["activity"])}>
                  {(["sedentary", "low", "moderate", "active"] as const).map((a) => (
                    <option key={a} value={a}>
                      {t(`m1.act.${a}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-slate-900">
                {t("m1.smoking")}
                <select className={selectCls} value={form.smoking} onChange={(e) => set("smoking")(e.target.value)}>
                  <option value="never">{t("m1.smoke.never")}</option>
                  <option value="former">{t("m1.smoke.former")}</option>
                  <option value="current">{t("m1.smoke.current")}</option>
                </select>
              </label>
            </div>
          </Section>

          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[400px] text-xs text-slate-500">{t("m1.footnote")}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  const at = patientId ? writeDraft(patientId, form) : null;
                  if (at) setDraftAt(at);
                }}
                className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                {t("m1.saveDraft")}
              </button>
              <button
                type="submit"
                disabled={!ready || busy}
                className="rounded-lg bg-brand px-7 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? t("diabetes.running") : t("m1.run")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">{t("m1.checks")}</p>
            {anyInvalid ? (
              <p className="flex items-start gap-2 text-[13px] text-status-critical">
                <CircleAlert size={16} className="mt-0.5 shrink-0" />
                {t("m1.checksBad")}
              </p>
            ) : (
              <p className="text-[13px] text-slate-600">{ready ? t("m1.checksOk") : t("m1.checksMissing")}</p>
            )}
            {hypertension && !form.knownHypertension && (
              <p className="rounded-lg bg-[#fef3c7] px-3 py-2 text-xs font-semibold text-status-prediabetes">{t("m1.htaDerived")}</p>
            )}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-[#ccfbf1] bg-[#a9c8be] p-5">
            <p className="flex items-center gap-2 text-[13px] font-bold text-brand-teal">
              <Shield size={16} />
              {t("m1.cdsTitle")}
            </p>
            <p className="text-xs leading-[1.5] text-slate-600">{t("m1.cdsText")}</p>
          </div>
        </div>
      </div>
    </form>
  );
}

export default function DiabetesPage() {
  return (
    <Suspense>
      <DiabetesForm />
    </Suspense>
  );
}
