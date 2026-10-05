"use client";

import { useState } from "react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

/** "<input type=datetime-local>" value (local time) from an ISO string. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Doctor sets a panel patient's next visit (PUT /api/patients/{id}/next-visit);
 *  the patient sees it on their home page and gets a visit reminder. */
export default function NextVisitCard({
  patientId,
  initial,
}: {
  patientId: string;
  initial: string | null | undefined;
}) {
  const { t, lang } = useI18n();
  const [value, setValue] = useState(toLocalInput(initial));
  const [saved, setSaved] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ next_visit_at: string | null }>(`/api/patients/${patientId}/next-visit`, {
        method: "PUT",
        body: JSON.stringify({ next_visit_at: next ? new Date(next).toISOString() : null }),
      });
      setSaved(res.next_visit_at);
      if (!next) setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">{t("visit.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {saved
          ? t("visit.current", {
              when: new Date(saved).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })
          : t("visit.none")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t("visit.title")}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="button"
          onClick={() => save(value)}
          disabled={busy || !value}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? t("auth.working") : t("visit.save")}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => save("")}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("visit.clear")}
          </button>
        )}
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
