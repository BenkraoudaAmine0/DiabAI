"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, ImageUp, RotateCcw } from "lucide-react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { MAX_PHOTO_MB, TONE_BADGE, confidencePct, photoProblem, scanLabel, scanTone } from "@/lib/scans";
import type { ScanResult } from "@/lib/types";

/** Shared photo upload → analysis → result for the foot / neck checks
 *  (patients scan themselves; doctors pass the patient's id).
 *  `renderAfterResult` adds e.g. the clinician's decision under the result. */
export default function ScanUploader({
  scanType,
  patientId,
  onDone,
  renderAfterResult,
}: {
  scanType: "foot" | "neck" | "eye";
  patientId?: string;
  onDone?: (result: ScanResult) => void; // e.g. refresh a list of past scans
  renderAfterResult?: (result: ScanResult) => React.ReactNode;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pick(f: File | null) {
    setResult(null);
    setError(null);
    if (f) {
      const problem = photoProblem(f);
      if (problem) {
        setError(t(problem, { mb: MAX_PHOTO_MB }));
        return;
      }
    }
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (patientId) form.append("patient_id", patientId);
      const res = await api<ScanResult>(`/api/scan/${scanType}`, { method: "POST", body: form });
      setResult(res);
      onDone?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const tone = scanTone(result.label);
    const probs = Object.entries(result.probabilities).sort((a, b) => b[1] - a[1]);
    return (
      <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start gap-5">
          {(result.image_url ?? preview) && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL / object URL
            <img src={result.image_url ?? preview ?? ""} alt="" className="size-28 shrink-0 rounded-lg bg-slate-100 object-cover" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("scan.result")}</p>
            <span className={`w-fit rounded-lg border px-4 py-2 text-lg font-extrabold ${TONE_BADGE[tone]}`}>{scanLabel(t, result.label)}</span>
            <p className="text-sm text-slate-600">
              {t("scan.confidenceIs", { n: confidencePct(result.confidence) ?? "—" })}
              {result.uncertain && result.top_class && ` · ${t("scan.mostLikely", { label: scanLabel(t, result.top_class) })}`}
            </p>
          </div>
        </div>

        {result.uncertain && (
          <p className="flex items-start gap-2 rounded-lg bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            {t("scan.uncertainHelp")}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {probs.map(([label, p]) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-600">
                <span>{scanLabel(t, label)}</span>
                <span className="font-mono font-semibold">{(p * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-slate-100">
                <div className="h-full rounded bg-brand" style={{ width: `${Math.max(2, p * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {renderAfterResult?.(result)}

        <button
          type="button"
          onClick={() => pick(null)}
          className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw size={15} />
          {t("scan.again")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center transition-colors hover:border-brand hover:bg-[#f6faf8]"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={preview} alt={t("scan.preview")} className="max-h-[320px] w-full rounded-lg object-contain" />
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-pt-mint text-brand">
              <ImageUp size={28} strokeWidth={1.6} />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-bold text-slate-900">{t("scan.upload")}</p>
              <p className="text-[13px] text-slate-500">{t("scan.formats", { mb: MAX_PHOTO_MB })}</p>
            </div>
            <span className="rounded-lg border border-brand px-5 py-2 text-[13px] font-semibold text-brand">{t("scan.browse")}</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {file && !busy && (
          <button type="button" onClick={() => pick(null)} className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
            {t("common.cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={analyze}
          disabled={!file || busy}
          className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {busy ? t("scan.analyzing") : t("scan.analyze")}
        </button>
      </div>
    </div>
  );
}
