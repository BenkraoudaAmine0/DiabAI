"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { PredictionResult } from "@/lib/types";
import ResultCard from "@/components/ResultCard";

interface PanelOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function DiabetesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [patients, setPatients] = useState<PanelOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [form, setForm] = useState({
    gender: "male",
    age: "",
    hypertension: false,
    heart_disease: false,
    smoking_history: "never",
    bmi: "",
    HbA1c_level: "",
    blood_glucose_level: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);

  useEffect(() => {
    api<{ patients: PanelOption[] }>("/api/patients")
      .then((r) => {
        setPatients(r.patients);
        if (r.patients.length > 0) setPatientId(r.patients[0].id);
      })
      .catch(() => setPatients([]));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<PredictionResult>("/api/diabetes/predict", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          gender: form.gender,
          age: Number(form.age),
          hypertension: form.hypertension,
          heart_disease: form.heart_disease,
          smoking_history: form.smoking_history,
          bmi: Number(form.bmi),
          HbA1c_level: Number(form.HbA1c_level),
          blood_glucose_level: Number(form.blood_glucose_level),
        }),
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

  if (patients.length === 0 && !error) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-600">{t("diabetes.noPatients")}</p>
        <button
          onClick={() => router.push("/doctor/patients")}
          className="mt-4 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {t("patients.new")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("diabetes.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("diabetes.subtitle")}</p>
      </div>

      {result && <ResultCard result={result} onNew={() => setResult(null)} />}

      <form
        onSubmit={submit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {t("diabetes.patient")}
          </span>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className={inputCls}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("diabetes.gender")}
            </span>
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              className={inputCls}
            >
              <option value="male">{t("common.male")}</option>
              <option value="female">{t("common.female")}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("diabetes.age")}
            </span>
            <input
              type="number"
              required
              min={0}
              max={120}
              value={form.age}
              onChange={(e) => set("age", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("diabetes.smoking")}
            </span>
            <select
              value={form.smoking_history}
              onChange={(e) => set("smoking_history", e.target.value)}
              className={inputCls}
            >
              <option value="never">{t("common.never")}</option>
              <option value="No Info">{t("common.noInfo")}</option>
              <option value="current">{t("common.current")}</option>
              <option value="former">{t("common.former")}</option>
              <option value="ever">{t("common.former")}</option>
              <option value="not current">{t("common.former")}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("diabetes.bmi")}
            </span>
            <input
              type="number"
              required
              step="0.1"
              min={8}
              max={80}
              value={form.bmi}
              onChange={(e) => set("bmi", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("diabetes.hba1c")}
            </span>
            <input
              type="number"
              required
              step="0.1"
              min={3}
              max={20}
              value={form.HbA1c_level}
              onChange={(e) => set("HbA1c_level", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("diabetes.glucose")}
            </span>
            <input
              type="number"
              required
              min={40}
              max={500}
              value={form.blood_glucose_level}
              onChange={(e) => set("blood_glucose_level", e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["hypertension", "diabetes.hypertension"],
              ["heart_disease", "diabetes.heartDisease"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <span className="text-sm font-medium text-slate-700">
                {t(label)}
              </span>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => set(key, e.target.checked)}
                className="h-5 w-5 accent-teal-600"
              />
            </label>
          ))}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !patientId}
          className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t("diabetes.predicting")}
            </span>
          ) : (
            t("diabetes.predict")
          )}
        </button>
      </form>
    </div>
  );
}
