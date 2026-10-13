"use client";

import { useI18n } from "@/i18n";
import { initials, shortId } from "@/lib/clinical";
import type { PanelPatient } from "@/lib/types";

/** Figma "Patient-Context-Header": the patient a module runs for (a picker
 *  while choosing, plain text on a result) · sex, age · record id. */
export default function PatientBar({
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
