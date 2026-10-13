"use client";

import { useState } from "react";
import { Check, Pencil, UsersRound } from "lucide-react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { scanLabel } from "@/lib/scans";
import type { ScanRow } from "@/lib/types";

type Decision = Pick<ScanRow, "review_status" | "reviewed_label" | "referred">;

/** Clinician decision on a foot / neck photo: confirm the model's label,
 *  correct it, or refer the patient (POST /api/scan/{id}/review). */
export default function ScanReview({
  scanId,
  options,
  label,
  decision,
  onSaved,
  compact = false,
}: {
  scanId: string;
  options: string[]; // the model's classes
  label: string | null | undefined; // the model's answer
  decision?: Decision;
  onSaved?: (d: Decision) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState<Decision | undefined>(decision?.review_status ? decision : undefined);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState(label && options.includes(label) ? label : options[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(kind: "confirmed" | "modified", referred = false) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Decision>(`/api/scan/${scanId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: kind, label: kind === "modified" ? chosen : undefined, referred }),
      });
      const next = { review_status: r.review_status ?? kind, reviewed_label: r.reviewed_label ?? null, referred: r.referred ?? referred };
      setCurrent(next);
      setEditing(false);
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const btn = compact ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm";

  if (current && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded-md bg-[#dcfce7] px-2 py-1 text-xs font-bold text-status-normal">
          <Check size={13} />
          {current.review_status === "modified"
            ? t("scan.rev.modified", { label: scanLabel(t, current.reviewed_label) })
            : t("scan.rev.confirmed")}
        </span>
        {current.referred && (
          <span className="flex items-center gap-1 rounded-md bg-[#e0f2fe] px-2 py-1 text-xs font-bold text-[#0369a1]">
            <UsersRound size={13} />
            {t("scan.rev.referred")}
          </span>
        )}
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-slate-500 underline hover:text-slate-700">
          {t("scan.rev.change")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!compact && <p className="text-[15px] font-bold text-slate-900">{t("scan.rev.title")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!editing ? (
          <>
            <button type="button" disabled={busy} onClick={() => decide("confirmed")} className={`rounded-lg bg-brand font-bold text-white hover:opacity-90 disabled:opacity-50 ${btn}`}>
              {t("scan.rev.confirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className={`flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 ${btn}`}
            >
              <Pencil size={13} />
              {t("scan.rev.modify")}
            </button>
          </>
        ) : (
          <>
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              aria-label={t("scan.rev.modify")}
              className={`rounded-lg border border-slate-200 bg-white text-slate-900 outline-none focus:border-brand ${btn}`}
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {scanLabel(t, o)}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy} onClick={() => decide("modified")} className={`rounded-lg bg-brand font-bold text-white hover:opacity-90 disabled:opacity-50 ${btn}`}>
              {t("common.save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={`font-semibold text-slate-500 ${btn}`}>
              {t("common.cancel")}
            </button>
          </>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(editing ? "modified" : "confirmed", true)}
          className={`flex items-center gap-1.5 rounded-lg bg-brand-teal font-bold text-white hover:opacity-90 disabled:opacity-50 ${btn}`}
        >
          <UsersRound size={13} />
          {t("scan.rev.refer")}
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
