"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, X } from "lucide-react";

import ActivityResult, { activityModule } from "@/components/ActivityResult";
import Sparkline, { type SparkPoint } from "@/components/doctor/Sparkline";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { downloadReport } from "@/lib/prediction";
import type { ActivityItem, PanelPatient, PatientClinical, PredictionRow } from "@/lib/types";

type ModuleFilter = "all" | "prediction" | "eye" | "foot" | "neck";

const MODULE_SHORT: Record<string, string> = {
  prediction: "hist.mod.m1",
  eye: "hist.mod.m3",
  foot: "hist.mod.foot",
  neck: "hist.mod.neck",
};

function shortDay(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB");
}

function ChartCard({
  title,
  target,
  targetTone,
  series,
  band,
  first,
  last,
  empty,
}: {
  title: string;
  target: string;
  targetTone: string;
  series: SparkPoint[][];
  band?: [number, number];
  first: string;
  last: string;
  empty: string;
}) {
  const has = series.some((s) => s.length > 0);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className={`font-mono text-xs font-bold ${targetTone}`}>{target}</p>
      </div>
      <div className="py-3">
        {has ? (
          <Sparkline series={series} band={band} label={title} />
        ) : (
          <p className="flex h-[120px] items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">{empty}</p>
        )}
      </div>
      {has && (
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>{first}</span>
          <span>{last}</span>
        </div>
      )}
    </div>
  );
}

/** Figma 02 Doctor Screens · history-timeline (2:2893): filters, trends of
 *  the selected patient, AI diagnostics table, detail side panel. */
export default function DoctorHistoryPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [patientId, setPatientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trend, setTrend] = useState<{ preds: PredictionRow[]; clinical: PatientClinical | null } | null>(null);
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api<{ items: ActivityItem[] }>("/api/dashboard/activity?limit=1000")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
    api<{ patients: PanelPatient[] }>("/api/patients")
      .then((r) => setPatients(r.patients))
      .catch(() => setPatients([]));
  }, [t]);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    Promise.all([
      api<{ predictions: PredictionRow[] }>(`/api/patients/${patientId}/records`),
      api<PatientClinical>(`/api/patients/${patientId}/clinical`).catch(() => null),
    ]).then(([rec, clinical]) => {
      if (!cancelled) setTrend({ preds: rec.predictions, clinical });
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const shown = useMemo(() => {
    const lo = from ? new Date(from).getTime() : -Infinity;
    const hi = to ? new Date(to).getTime() + 86_400_000 : Infinity;
    return (items ?? []).filter((it) => {
      const mod = it.kind === "prediction" ? "prediction" : it.scan_type ?? "eye";
      const at = new Date(it.created_at).getTime();
      return (
        (moduleFilter === "all" || mod === moduleFilter) &&
        (!patientId || it.patient_id === patientId) &&
        at >= lo &&
        at < hi
      );
    });
  }, [items, moduleFilter, patientId, from, to]);

  // trend series for the selected patient (lab history + prediction inputs)
  const series = useMemo(() => {
    const vitals = trend?.clinical?.vitals ?? [];
    const preds = trend?.preds ?? [];
    const pts = (rows: { at: string; v: number | null | undefined }[]) =>
      rows.filter((r) => r.v != null).map((r) => ({ at: r.at, value: Number(r.v) }));
    return {
      glucose: pts([
        ...vitals.map((v) => ({ at: v.measured_at, v: v.fasting_glucose })),
        ...preds.map((p) => ({ at: p.created_at, v: p.input.blood_glucose_level })),
      ]),
      hba1c: pts([
        ...vitals.map((v) => ({ at: v.measured_at, v: v.hba1c })),
        ...preds.map((p) => ({ at: p.created_at, v: p.input.HbA1c_level })),
      ]),
      weight: pts(vitals.map((v) => ({ at: v.measured_at, v: v.weight_kg }))),
      sys: pts(vitals.map((v) => ({ at: v.measured_at, v: v.systolic }))),
      dia: pts(vitals.map((v) => ({ at: v.measured_at, v: v.diastolic }))),
    };
  }, [trend]);

  const ends = (s: SparkPoint[], unit: string) => {
    if (!s.length) return ["", ""];
    const sorted = [...s].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const a = sorted[0];
    const b = sorted[sorted.length - 1];
    return [`${shortDay(a.at, lang)} (${a.value} ${unit})`, `${shortDay(b.at, lang)} (${b.value} ${unit})`];
  };

  const filterCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-extrabold text-slate-900">{t("hist.title")}</h1>
        {items && (
          <span className="rounded-full bg-[#e6f2eb] px-2 py-0.5 text-xs font-bold text-brand">
            {t("hist.count", { n: items.length })}
          </span>
        )}
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
          <CalendarDays size={14} className="shrink-0 text-slate-500" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("hist.from")} className="w-full min-w-0 bg-transparent text-[13px] text-slate-900 outline-none" />
          <span className="text-slate-400">–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("hist.to")} className="w-full min-w-0 bg-transparent text-[13px] text-slate-900 outline-none" />
        </div>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as ModuleFilter)} aria-label={t("hist.module")} className={filterCls}>
          {(["all", "prediction", "eye", "foot", "neck"] as const).map((m) => (
            <option key={m} value={m}>
              {t("hist.modulePrefix")} {m === "all" ? t("hist.allModules") : t(MODULE_SHORT[m])}
            </option>
          ))}
        </select>
        <select
          value={patientId}
          onChange={(e) => {
            setPatientId(e.target.value);
            if (!e.target.value) setTrend(null);
          }}
          aria-label={t("hist.patient")}
          className={filterCls}
        >
          <option value="">
            {t("hist.patientPrefix")} {t("hist.allPatients")}
          </option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {t("hist.patientPrefix")} {p.full_name ?? p.email}
            </option>
          ))}
        </select>
      </div>

      {patientId && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title={t("hist.glucose")}
            target={t("hist.glucoseTarget")}
            targetTone="text-status-normal"
            series={[series.glucose]}
            band={[70, 110]}
            first={ends(series.glucose, "mg/dL")[0]}
            last={ends(series.glucose, "mg/dL")[1]}
            empty={t("hist.noData")}
          />
          <ChartCard
            title={t("hist.hba1c")}
            target={t("hist.hba1cTarget")}
            targetTone="text-brand-teal"
            series={[series.hba1c]}
            band={[4, 7]}
            first={ends(series.hba1c, "%")[0]}
            last={ends(series.hba1c, "%")[1]}
            empty={t("hist.noData")}
          />
          <ChartCard
            title={t("hist.weight")}
            target=""
            targetTone="text-slate-500"
            series={[series.weight]}
            first={ends(series.weight, "kg")[0]}
            last={ends(series.weight, "kg")[1]}
            empty={t("hist.noData")}
          />
          <ChartCard
            title={t("hist.bp")}
            target={t("hist.bpTarget")}
            targetTone="text-status-critical"
            series={[series.sys, series.dia]}
            first={ends(series.sys, "mmHg")[0]}
            last={ends(series.sys, "mmHg")[1]}
            empty={t("hist.noData")}
          />
        </div>
      )}

      <div className="flex gap-0">
        <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-bold text-slate-900">{t("hist.table")}</h2>
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          {!items && !error ? (
            <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
          ) : shown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{t("history.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="w-[110px] pb-5 pr-4 font-bold">{t("pp.date")}</th>
                    <th className="pb-5 pr-4 font-bold">{t("hist.patient")}</th>
                    <th className="w-[150px] pb-5 pr-4 font-bold">{t("hist.module")}</th>
                    <th className="w-[200px] pb-5 pr-4 font-bold">{t("hist.result")}</th>
                    <th className="w-[100px] pb-5 pr-4 font-bold">{t("hist.confidence")}</th>
                    <th className="w-[110px] pb-5 font-bold">{t("hist.version")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => {
                    const conf = it.kind === "prediction" ? Math.max(it.probability ?? 0, 1 - (it.probability ?? 0)) : it.confidence ?? null;
                    return (
                      <tr
                        key={`${it.kind}-${it.id}`}
                        onClick={() => setSelected(it)}
                        className={`cursor-pointer border-b border-slate-200 transition-colors hover:bg-[#f6faf8] ${selected?.id === it.id ? "bg-[#f6faf8]" : ""}`}
                      >
                        <td className="py-3 pr-4 text-slate-500">{shortDay(it.created_at, lang)}</td>
                        <td className="py-3 pr-4 text-sm font-bold text-slate-900">{it.patient_name}</td>
                        <td className="py-3 pr-4 text-slate-700">{t(MODULE_SHORT[it.kind === "prediction" ? "prediction" : it.scan_type ?? "eye"])}</td>
                        <td className="py-3 pr-4">
                          <ActivityResult item={it} />
                        </td>
                        <td className="py-3 pr-4 font-mono font-bold text-brand">{conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}</td>
                        <td className="py-3 text-slate-500">{it.kind === "prediction" ? "M1 · XGBoost" : "M3 · CNN"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col gap-6 overflow-y-auto border-l border-slate-200 bg-white p-8 shadow-[-8px_0_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between">
              <p className="text-lg font-extrabold text-slate-900">{t("hist.details")}</p>
              <button type="button" onClick={() => setSelected(null)} aria-label={t("dr.close")} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4">
              <p className="text-[15px] font-bold text-slate-900">{selected.patient_name}</p>
              <p className="text-xs text-slate-500">
                {selected.age != null && `${t("common.ageShort", { n: selected.age })} • `}
                {shortDay(selected.created_at, lang)}
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-bold uppercase text-slate-500">{t("hist.module")}</p>
                <p className="text-sm font-semibold text-slate-900">{t(activityModule(selected))}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-bold uppercase text-slate-500">{t("hist.result")}</p>
                <ActivityResult item={selected} />
              </div>
              {selected.kind === "prediction" && selected.probability != null && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-bold uppercase text-slate-500">{t("hist.explain")}</p>
                  <p className="text-[13px] leading-[18px] text-slate-700">
                    {t("hist.explainText", { p: (selected.probability * 100).toFixed(1) })}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <Link href={selected.link} className="rounded-lg border border-slate-200 p-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {t("hist.open")}
              </Link>
              {selected.kind === "prediction" && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await downloadReport(selected.id, lang);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className="rounded-lg bg-brand p-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {exporting ? t("report.exporting") : t("hist.exportPdf")}
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
