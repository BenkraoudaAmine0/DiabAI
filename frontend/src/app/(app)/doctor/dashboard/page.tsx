"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { PanelPatient } from "@/lib/types";

interface ModelStatus {
  diabetes: boolean;
  foot: boolean;
  neck: boolean;
  eye: boolean;
}

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [models, setModels] = useState<ModelStatus | null>(null);

  useEffect(() => {
    api<{ patients: PanelPatient[] }>("/api/patients")
      .then((r) => setPatients(r.patients))
      .catch(() => setPatients([]));
    api<ModelStatus>("/api/health")
      .then(setModels)
      .catch(() => setModels(null));
  }, []);

  const totalPredictions = patients.reduce(
    (n, p) => n + p.record_counts.predictions,
    0
  );
  const totalScans = patients.reduce((n, p) => n + p.record_counts.scans, 0);

  const stats = [
    { label: t("dash.panel"), value: patients.length, icon: "👥" },
    { label: t("dash.predictions"), value: totalPredictions, icon: "🩺" },
    { label: t("dash.scans"), value: totalScans, icon: "👁" },
  ];

  const modelList: { key: keyof ModelStatus; label: string }[] = [
    { key: "diabetes", label: t("nav.diabetes") },
    { key: "foot", label: "Foot" },
    { key: "neck", label: "Neck" },
    { key: "eye", label: "Eye" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("nav.dashboard")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.full_name} —{" "}
          {t(profile?.role === "admin" ? "role.admin" : "role.doctor")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span className="text-2xl" aria-hidden>
              {s.icon}
            </span>
            <p className="mt-2 text-3xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">{t("dash.quick")}</h2>
          <div className="mt-3 grid gap-2">
            <Link
              href="/doctor/diabetes"
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-700"
            >
              {t("dash.newPrediction")}
            </Link>
            <Link
              href="/doctor/patients"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("dash.newPatient")}
            </Link>
            <Link
              href="/chat"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("dash.goChat")}
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">{t("dash.models")}</h2>
          <ul className="mt-3 space-y-2">
            {modelList.map(({ key, label }) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">{label}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    models?.[key]
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {models?.[key] ? t("dash.installed") : t("dash.missing")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{t("dash.panel")}</h2>
          <Link
            href="/doctor/patients"
            className="text-sm font-semibold text-teal-600"
          >
            {t("nav.patients")} →
          </Link>
        </div>
        {patients.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("patients.empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {patients.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/doctor/patients/${p.id}`}
                  className="flex items-center justify-between py-2.5 text-sm hover:text-teal-700"
                >
                  <span className="font-medium text-slate-800">
                    {p.full_name ?? p.email}
                  </span>
                  <span className="text-xs text-slate-400">
                    {p.record_counts.predictions} {t("patients.predictions")} ·{" "}
                    {p.record_counts.scans} {t("patients.scans")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
