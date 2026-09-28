"use client";

import ScanUploader from "@/components/ScanUploader";
import { useI18n } from "@/i18n";

export default function PatientFootPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("scan.foot.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("scan.foot.desc")}</p>
      </div>
      <ScanUploader scanType="foot" />
    </div>
  );
}
