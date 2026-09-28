"use client";

import { useEffect, useState } from "react";

import ScanUploader from "@/components/ScanUploader";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

interface PanelOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function RetinaPage() {
  const { t } = useI18n();
  const [patients, setPatients] = useState<PanelOption[]>([]);
  const [patientId, setPatientId] = useState("");

  useEffect(() => {
    api<{ patients: PanelOption[] }>("/api/patients")
      .then((r) => {
        setPatients(r.patients);
        if (r.patients.length > 0) setPatientId(r.patients[0].id);
      })
      .catch(() => setPatients([]));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("scan.eye.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("scan.eye.desc")}</p>
      </div>

      {patients.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {t("scan.for")}
          </span>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </label>
      )}

      <ScanUploader scanType="eye" patientId={patientId || undefined} />
    </div>
  );
}
