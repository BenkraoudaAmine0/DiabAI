"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Clock, Eye, Shield, Upload, UsersRound, X } from "lucide-react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { initials, shortId } from "@/lib/clinical";
import { checkFundusQuality, type CheckStatus, type QualityReport } from "@/lib/imageQuality";
import type { PanelPatient, ScanResult } from "@/lib/types";

// model labels (models_app/eye/labels.json) → ICDR grade 0–4
const GRADE_OF: Record<string, number> = { "No DR": 0, Mild: 1, Moderate: 2, Severe: 3, "Proliferative DR": 4 };
const LABELS = Object.keys(GRADE_OF);
const GRADE_BAR = ["bg-status-normal", "bg-status-prediabetes", "bg-status-diabetes", "bg-status-critical", "bg-slate-900"];
const GRADE_BADGE = [
  "border-[#bbf7d0] bg-[#dcfce7] text-status-normal",
  "border-[#fde68a] bg-[#fef3c7] text-status-prediabetes",
  "border-[#fed7aa] bg-[#ffedd5] text-status-diabetes",
  "border-[#fecaca] bg-[#fee2e2] text-status-critical",
  "border-slate-300 bg-slate-100 text-slate-900",
];
const MAX_MB = 10;

const CHECK_TONE: Record<CheckStatus, { cls: string; icon: typeof Check; key: string }> = {
  ok: { cls: "bg-[#dcfce7] text-status-normal", icon: Check, key: "ret.check.ok" },
  warn: { cls: "bg-[#fef3c7] text-status-prediabetes", icon: Clock, key: "ret.check.warn" },
  fail: { cls: "bg-[#fee2e2] text-status-critical", icon: X, key: "ret.check.fail" },
};

function gradeOf(label: string | undefined): number | null {
  return label && label in GRADE_OF ? GRADE_OF[label] : null;
}

function PatientBar({
  patients,
  patientId,
  onChange,
  extra,
}: {
  patients: PanelPatient[];
  patientId: string;
  onChange?: (id: string) => void;
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  const p = patients.find((x) => x.id === patientId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-3 text-[13px] text-slate-500">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
          {initials(p?.full_name ?? p?.email)}
        </span>
        {onChange ? (
          <select
            value={patientId}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t("m1.patient")}
            className="max-w-[260px] rounded-md bg-transparent text-[15px] font-bold text-slate-900 outline-none hover:bg-slate-50"
          >
            {patients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.full_name ?? x.email}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[15px] font-bold text-slate-900">{p?.full_name ?? "—"}</span>
        )}
        {p && (
          <>
            <span className="h-2.5 w-px bg-slate-200" aria-hidden />
            <span>
              {p.sex ? t(p.sex === "male" ? "common.male" : "common.female") : "—"}
              {p.age != null && `, ${t("common.ageShort", { n: p.age })}`}
            </span>
            <span className="h-2.5 w-px bg-slate-200" aria-hidden />
            <span>
              ID: <span className="font-mono">PT-{shortId(p.id).toUpperCase()}</span>
            </span>
          </>
        )}
        {extra}
      </div>
    </div>
  );
}

/** Figma 02 Doctor Screens · retinal-screening (2:1926) → retinal-result (2:2077). */
export default function RetinaPage() {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [patients, setPatients] = useState<PanelPatient[] | null>(null);
  const [patientId, setPatientId] = useState("");
  const [eye, setEye] = useState<"OD" | "OG">("OD");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    api<{ patients: PanelPatient[] }>("/api/patients")
      .then((r) => {
        setPatients(r.patients);
        setPatientId((id) => id || r.patients[0]?.id || "");
      })
      .catch(() => setPatients([]));
  }, []);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function choose(f: File | null) {
    setError(null);
    setOverride(false);
    setQuality(null);
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(t("ret.tooBig", { mb: MAX_MB }));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setChecking(true);
    try {
      setQuality(await checkFundusQuality(f));
    } catch {
      setQuality(null);
    } finally {
      setChecking(false);
    }
  }

  const failed = quality ? (["sharpness", "illumination", "centering", "artefacts"] as const).filter((k) => quality[k] === "fail") : [];
  const canRun = !!file && !!patientId && !checking && (failed.length === 0 || override);

  async function analyze() {
    if (!file || !canRun) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("patient_id", patientId);
      setResult(await api<ScanResult>("/api/scan/eye", { method: "POST", body: form }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (patients === null) return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />;

  if (result) {
    return (
      <RetinaResult
        result={result}
        preview={preview}
        eye={eye}
        patientBar={<PatientBar patients={patients} patientId={patientId} />}
        onNew={() => {
          setResult(null);
          choose(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PatientBar
        patients={patients}
        patientId={patientId}
        onChange={setPatientId}
        extra={
          <>
            <span className="h-2.5 w-px bg-slate-200" aria-hidden />
            <span className="flex rounded-md border border-slate-200 p-0.5" role="group" aria-label={t("ret.eye")}>
              {(["OD", "OG"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={eye === e}
                  onClick={() => setEye(e)}
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${eye === e ? "bg-[#e6f2eb] text-brand" : "text-slate-500"}`}
                >
                  {t(`ret.eye.${e}`)}
                </button>
              ))}
            </span>
          </>
        }
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("ret.title")}</h1>
        <p className="text-sm text-slate-500">{t("ret.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(e.dataTransfer.files?.[0] ?? null);
            }}
            className="flex h-[420px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center transition-colors hover:border-brand hover:bg-[#f6faf8]"
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-[#e6f2eb] text-brand">
              <Upload size={32} strokeWidth={1.6} />
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-bold text-slate-900">{file ? file.name : t("ret.drop")}</p>
              <p className="text-[13px] text-slate-500">{t("ret.formats", { mb: MAX_MB })}</p>
            </div>
            <span className="rounded-lg border border-brand px-5 py-2.5 text-[13px] font-semibold text-brand">{t("ret.browse")}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/tiff"
              className="hidden"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-[15px] font-bold text-slate-900">{t("ret.checks")}</p>
            <div className="flex flex-col gap-3">
              {(["sharpness", "illumination", "centering", "artefacts"] as const).map((k) => {
                const st = quality?.[k];
                const tone = st ? CHECK_TONE[st] : null;
                const IconCmp = tone?.icon;
                return (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
                    <span className="text-[13px] text-slate-700">{t(`ret.check.${k}`)}</span>
                    {tone && IconCmp ? (
                      <span className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${tone.cls}`}>
                        <IconCmp size={12} />
                        {t(tone.key)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">{checking ? t("ret.checking") : "—"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {failed.length > 0 && (
            <div className="flex flex-col gap-3.5 rounded-xl border border-[#fca5a5] bg-[#fee2e2] p-5">
              <p className="flex items-center gap-2 text-sm font-bold uppercase text-status-critical">
                <CircleAlert size={18} />
                {t("ret.badQuality")}
              </p>
              <ul className="list-disc pl-5 text-[13px] leading-[1.5] text-[#7f1d1d]">
                {failed.map((k) => (
                  <li key={k}>{t(`ret.fail.${k}`)}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  choose(null);
                  inputRef.current?.click();
                }}
                className="w-full rounded-md bg-status-critical px-4 py-2.5 text-[13px] font-bold text-white hover:opacity-90"
              >
                {t("ret.retake")}
              </button>
              {!override && (
                <button type="button" onClick={() => setOverride(true)} className="text-xs font-semibold text-[#7f1d1d] underline">
                  {t("ret.override")}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-[#a9c8be] p-5">
            <p className="text-sm font-bold text-slate-900">{t("ret.preview")}</p>
            <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-lg bg-slate-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img src={preview} alt={t("ret.preview")} className="h-full w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-xs text-slate-500">
                  <Eye size={40} strokeWidth={1.2} className="text-slate-400" />
                  {t("ret.noImage")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <Shield size={16} className="shrink-0 text-slate-500" />
          {t("ret.disclaimer")}
        </p>
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={analyze}
            disabled={!canRun || busy}
            className="rounded-lg bg-brand px-8 py-3.5 text-[15px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t("ret.analyzing") : t("ret.run")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RetinaResult({
  result,
  preview,
  eye,
  patientBar,
  onNew,
}: {
  result: ScanResult;
  preview: string | null;
  eye: "OD" | "OG";
  patientBar: React.ReactNode;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const grade = gradeOf(result.top_class ?? result.label);
  const [opacity, setOpacity] = useState(75);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState(result.top_class ?? result.label);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const image = result.image_url ?? preview;

  async function decide(decision: "confirmed" | "modified", referred = false) {
    setError(null);
    try {
      await api(`/api/scan/${result.scan_id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, label: decision === "modified" ? chosen : undefined, referred }),
      });
      setSaved(referred ? t("ret.savedRefer") : t("ret.saved"));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {patientBar}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("ret.resTitle")}</h1>
          <p className="text-sm text-slate-500">{t("ret.resSubtitle")}</p>
        </div>
        <button type="button" onClick={onNew} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
          {t("ret.new")}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_450px]">
        <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-[15px] font-bold text-slate-700">{t("ret.global")}</p>
          <div className={`flex w-fit items-center gap-3 rounded-lg border px-6 py-3 ${grade != null ? GRADE_BADGE[grade] : GRADE_BADGE[4]}`}>
            <Eye size={24} />
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-extrabold">{grade != null ? `GRADE ${grade}` : t("ret.uncertain")}</p>
              <p className="text-[13px] font-semibold">{grade != null ? t(`ret.grade.${grade}`) : result.label}</p>
            </div>
          </div>
          <div className="h-px bg-slate-200" />
          <div className="flex flex-wrap gap-8">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-500">{t("ret.certainty")}</p>
              <p className="font-mono text-2xl font-bold text-brand-teal">{(result.confidence * 100).toFixed(0)}%</p>
            </div>
            <span className="w-px self-stretch bg-slate-200" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-500">{t("ret.eyeAnalysed")}</p>
              <p className="text-sm font-bold text-slate-900">{t(`ret.eye.${eye}`)}</p>
            </div>
            <span className="w-px self-stretch bg-slate-200" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-500">{t("ret.referable")}</p>
              <p className="font-mono text-sm text-slate-700">
                {result.referable_dr_probability != null ? `${(result.referable_dr_probability * 100).toFixed(0)}%` : "—"}
                {result.referable_dr != null && ` · ${result.referable_dr ? t("act.referable") : t("pp.notReferable")}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-[15px] font-bold text-slate-900">{t("ret.distribution")}</p>
          <div className="flex flex-col gap-2.5">
            {LABELS.map((label) => {
              const g = GRADE_OF[label];
              const p = result.probabilities[label] ?? 0;
              const top = g === grade;
              return (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex items-start justify-between text-[11px]">
                    <span className={top ? "font-bold text-slate-900" : "font-medium text-slate-700"}>
                      Grade {g} - {t(`ret.grade.${g}`)}
                    </span>
                    <span className={`font-mono font-bold ${top ? "text-status-diabetes" : "text-slate-500"}`}>{(p * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-slate-50">
                    <div className={`h-full ${GRADE_BAR[g]}`} style={{ width: `${p * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Heatmap-Viewer-Section */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <p className="text-[15px] font-bold text-slate-900">{t("ret.attention")}</p>
          <p className="text-[13px] text-slate-500">{t("ret.attentionDesc")}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[false, true].map((overlay) => (
            <figure key={String(overlay)} className="flex flex-col gap-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL / object URL
                  <img src={image} alt="" className="h-full w-full object-contain" />
                )}
                {overlay && (
                  <span className="absolute inset-x-3 bottom-3 rounded-md bg-slate-900/70 px-3 py-2 text-center text-[11px] text-white">
                    {t("ret.noHeatmap")}
                  </span>
                )}
              </div>
              <figcaption className="text-center text-xs font-semibold text-slate-700">
                {t(overlay ? "ret.overlay" : "ret.original")}
              </figcaption>
            </figure>
          ))}
        </div>
        <label className="flex items-center gap-4 text-xs text-slate-500">
          {t("ret.opacity")}
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            disabled
            className="flex-1 accent-[#0e7c4a]"
          />
          <span className="w-10 font-mono font-bold text-brand">{opacity}%</span>
        </label>
        <p className="text-center text-[11px] italic text-slate-500">{t("ret.attentionNote")}</p>
      </div>

      {/* Clinician-Decision-Card */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-[15px] font-bold text-slate-900">{t("ret.decision")}</p>
        {saved && <p className="rounded-lg bg-[#dcfce7] px-3 py-2 text-[13px] font-semibold text-status-normal">{saved}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {!editing ? (
              <>
                <button type="button" onClick={() => decide("confirmed")} className="rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90">
                  {grade != null ? t("ret.confirm", { g: grade }) : t("ret.confirmPlain")}
                </button>
                <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t("ret.modify")}
                </button>
              </>
            ) : (
              <>
                <select
                  value={chosen}
                  onChange={(e) => setChosen(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-brand"
                >
                  {LABELS.map((l) => (
                    <option key={l} value={l}>
                      Grade {GRADE_OF[l]} — {t(`ret.grade.${GRADE_OF[l]}`)}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => decide("modified")} className="rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90">
                  {t("common.save")}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-3 text-sm font-semibold text-slate-500">
                  {t("common.cancel")}
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => decide(editing ? "modified" : "confirmed", true)}
            className="flex items-center gap-2 rounded-lg bg-brand-teal px-6 py-3 text-sm font-bold text-white hover:opacity-90"
          >
            <UsersRound size={14} />
            {t("ret.refer")}
          </button>
        </div>
      </div>
    </div>
  );
}
