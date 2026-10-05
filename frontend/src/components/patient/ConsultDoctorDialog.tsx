"use client";

import { useEffect } from "react";
import { Mail, Phone, Stethoscope, X } from "lucide-react";

import { usePatientSummary } from "@/hooks/usePatientSummary";
import { useI18n } from "@/i18n";

/** "Consult a doctor" (questionnaire, symptom check, chat): the patient's
 *  care team — the doctors whose panel they are in — with contact links. */
export default function ConsultDoctorDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { summary, loading } = usePatientSummary();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doctors = summary?.doctors ?? [];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consult-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-pt-ink/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-pt-border bg-white p-6 shadow-[0_12px_32px_rgba(23,51,47,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
              <Stethoscope size={20} />
            </span>
            <h2 id="consult-title" className="text-lg font-bold text-pt-ink">
              {t("pt.consult.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("pt.consult.close")}
            className="rounded-lg p-1.5 text-pt-muted hover:bg-pt-cream"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="mt-5 h-20 animate-pulse rounded-xl bg-pt-cream" />
        ) : doctors.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-pt-muted">{t("pt.consult.none")}</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-pt-muted">{t("pt.consult.intro")}</p>
            <ul className="mt-3 space-y-2">
              {doctors.map((d) => (
                <li key={d.id} className="rounded-xl border border-pt-border p-3">
                  <p className="font-semibold text-pt-ink">{d.full_name ?? "—"}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {d.email && (
                      <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 text-pt-primary hover:underline">
                        <Mail size={14} />
                        {d.email}
                      </a>
                    )}
                    {d.phone && (
                      <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1.5 text-pt-primary hover:underline">
                        <Phone size={14} />
                        {d.phone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
