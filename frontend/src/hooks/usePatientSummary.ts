"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { PatientSummary } from "@/lib/types";

/** GET /api/records/me/summary — last check, next visit, care team. */
export function usePatientSummary() {
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PatientSummary>("/api/records/me/summary")
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  return { summary, error, loading: !summary && !error };
}
