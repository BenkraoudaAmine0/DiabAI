"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Check, CircleAlert, History, ShieldCheck } from "lucide-react";

import ScanUploader from "@/components/ScanUploader";
import { useModelAvailability } from "@/hooks/useModelAvailability";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/patient";
import { TONE_BADGE, confidencePct, scanLabel, scanTone } from "@/lib/scans";
import type { ScanRow } from "@/lib/types";

const card = "flex flex-col gap-4 rounded-2xl border border-pt-border bg-white p-5";

/** Patient photo check (foot ulcer / neck acanthosis): tips, the upload and
 *  the patient's previous checks of that kind. When the analysis model is
 *  not installed on the server the page says so instead of failing. */
export default function PhotoCheck({ type }: { type: "foot" | "neck" }) {
  const { t, lang } = useI18n();
  const models = useModelAvailability();
  const available = models ? Boolean(models[type]) : null;
  const [past, setPast] = useState<ScanRow[]>([]);

  const loadPast = useCallback(() => {
    api<{ scans: ScanRow[] }>("/api/records/me")
      .then((r) => setPast(r.scans.filter((s) => s.scan_type === type)))
      .catch(() => setPast([]));
  }, [type]);

  useEffect(() => {
    loadPast();
  }, [loadPast]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold leading-[1.15] text-pt-ink">{t(`pt.check.${type}.title`)}</h1>
        <p className="text-[13px] text-pt-muted">{t(`pt.check.${type}.subtitle`)}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {available === false ? (
            <div className="flex items-start gap-3 rounded-2xl border border-[#f2d7a6] bg-[#fdf6e9] p-5">
              <CircleAlert size={20} className="mt-0.5 shrink-0 text-[#a96312]" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-pt-ink">{t("pt.check.unavailable")}</p>
                <p className="text-sm text-pt-muted">{t("pt.check.unavailableText")}</p>
              </div>
            </div>
          ) : (
            <ScanUploader scanType={type} onDone={loadPast} />
          )}

          <div className={card}>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
                <History size={18} strokeWidth={1.75} />
              </span>
              <span className="text-base font-bold text-pt-ink">{t("pt.check.past")}</span>
            </div>
            {past.length === 0 && <p className="text-sm text-pt-muted">{t("pt.check.noPast")}</p>}
            {past.map((s) => (
              <div key={s.id} className="flex items-center gap-4 rounded-xl bg-pt-mint-soft p-3">
                {s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
                  <img src={s.image_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="size-14 shrink-0 rounded-lg bg-pt-border" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={`w-fit rounded-md border px-2 py-0.5 text-xs font-bold ${TONE_BADGE[scanTone(s.result?.label)]}`}>
                    {scanLabel(t, s.result?.label)}
                  </span>
                  {confidencePct(s.result?.confidence) && (
                    <p className="text-xs text-pt-muted">{t("pt.check.confidence", { n: (s.result!.confidence! * 100).toFixed(0) })}</p>
                  )}
                  {s.review_status && (
                    // the doctor's reading of this photo
                    <p className="flex items-center gap-1 text-xs font-semibold text-status-normal">
                      <Check size={13} />
                      {s.review_status === "modified"
                        ? t("pt.check.reviewedAs", { label: scanLabel(t, s.reviewed_label) })
                        : t("pt.check.reviewed")}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-pt-muted">{shortDate(s.created_at, lang)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className={card}>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
                <Camera size={18} strokeWidth={1.75} />
              </span>
              <span className="text-base font-bold text-pt-ink">{t("pt.check.tips")}</span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-sm text-pt-ink">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pt-primary" aria-hidden />
                  {t(`pt.check.${type}.tip${n}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-pt-deep p-5">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-white" />
            <p className="text-sm leading-[1.5] text-white/85">{t(`pt.check.${type}.disclaimer`)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
