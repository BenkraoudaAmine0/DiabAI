"use client";

import { useI18n } from "@/i18n";
import { bmiOf, shortDate } from "@/lib/patient";
import type { PatientVitals } from "@/lib/types";

type Key = "glucose" | "hba1c" | "bp" | "weight" | "height" | "bmi";

/** The patient's latest measurements (values only, no judgement: the doctor
 *  explains them). `compact` = the 4 home tiles, else the full list. */
export default function VitalsTiles({ vitals, compact = false }: { vitals: PatientVitals | null | undefined; compact?: boolean }) {
  const { t, lang } = useI18n();
  if (!vitals) {
    return <p className="rounded-xl border border-dashed border-pt-border bg-white p-4 text-center text-sm text-pt-muted">{t("pt.v.none")}</p>;
  }
  const bmi = bmiOf(vitals.weight_kg, vitals.height_cm);
  const value: Record<Key, [string | null, string]> = {
    glucose: [vitals.fasting_glucose != null ? String(vitals.fasting_glucose) : null, "mg/dL"],
    hba1c: [vitals.hba1c != null ? String(vitals.hba1c) : null, "%"],
    bp: [vitals.systolic != null ? `${vitals.systolic}/${vitals.diastolic ?? "—"}` : null, "mmHg"],
    weight: [vitals.weight_kg != null ? String(vitals.weight_kg) : null, "kg"],
    height: [vitals.height_cm != null ? String(vitals.height_cm) : null, "cm"],
    bmi: [bmi != null ? String(bmi) : null, "kg/m²"],
  };
  const keys: Key[] = compact ? ["hba1c", "glucose", "bp", "bmi"] : ["glucose", "hba1c", "bp", "weight", "height", "bmi"];

  return (
    <div className="flex flex-col gap-3">
      <div className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "flex flex-col gap-2"}>
        {keys.map((k) => {
          const [v, unit] = value[k];
          return compact ? (
            <div key={k} className="flex flex-col gap-1 rounded-xl bg-pt-mint-soft p-3">
              <span className="text-xs text-pt-muted">{t(`pt.v.${k}`)}</span>
              <span className="text-lg font-bold text-pt-ink">
                {v ?? "—"} {v && <span className="text-xs font-medium text-pt-muted">{unit}</span>}
              </span>
            </div>
          ) : (
            <div key={k} className="flex items-center justify-between rounded-xl bg-pt-mint-soft px-4 py-3">
              <span className="text-sm text-pt-ink">{t(`pt.v.${k}`)}</span>
              <span className="font-mono text-base font-bold text-pt-ink">
                {v ?? "—"} <span className="font-sans text-xs font-medium text-pt-muted">{unit}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-pt-muted">{t("pt.v.measured", { date: shortDate(vitals.measured_at, lang) ?? "—" })}</p>
    </div>
  );
}
