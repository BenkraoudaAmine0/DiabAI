"use client";

import { useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { ScanResult } from "@/lib/types";

/** Shared image upload + analyze + result UI for foot / neck / eye scans. */
export default function ScanUploader({
  scanType,
  patientId,
}: {
  scanType: "foot" | "neck" | "eye";
  patientId?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  function pick(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
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
      const res = await api<ScanResult>(`/api/scan/${scanType}`, {
        method: "POST",
        body: form,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const probs = Object.entries(result.probabilities).sort(
      (a, b) => b[1] - a[1]
    );
    return (
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("scan.result")}
            </p>
            <p className="text-3xl font-bold text-slate-900">{result.label}</p>
          </div>
          <span className="rounded-full bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-700">
            {(result.confidence * 100).toFixed(1)}% {t("scan.confidence")}
          </span>
        </div>

        <div className="space-y-2">
          {probs.map(([label, p]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{label}</span>
                <span>{(p * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-teal-500"
                  style={{ width: `${Math.max(2, p * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => pick(null)}
          className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {t("scan.again")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => inputRef.current?.click()}
        className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-500 transition-colors hover:border-teal-500 hover:text-teal-600"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            className="h-full w-full rounded-xl object-contain"
          />
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 16V8m0 0l-3 3m3-3l3 3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-medium">{t("scan.upload")}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        onClick={analyze}
        disabled={!file || busy}
        className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {t("scan.analyzing")}
          </span>
        ) : (
          t("scan.analyze")
        )}
      </button>
    </div>
  );
}
