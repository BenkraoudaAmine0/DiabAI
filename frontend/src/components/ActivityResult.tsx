"use client";

import ClinicalBadge from "@/components/ClinicalBadge";
import { useI18n } from "@/i18n";
import { scanLabel } from "@/lib/clinical";
import type { ActivityItem } from "@/lib/types";

/** i18n key of an activity's module: "act.prediction", "act.eye"… */
export function activityModule(item: ActivityItem): string {
  return item.kind === "prediction" ? "act.prediction" : `act.${item.scan_type ?? "eye"}`;
}

/** Result badge of a prediction (clinical status, "to review") or a scan
 *  (model label, "to refer"). Used on the dashboard and the History page. */
export default function ActivityResult({ item }: { item: ActivityItem }) {
  const { t } = useI18n();
  if (item.kind === "prediction") {
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {item.review === "pending" && (
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
            {t("act.pending")}
          </span>
        )}
        <ClinicalBadge status={item.status ?? "none"} />
      </span>
    );
  }
  return (
    <span
      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold ${
        item.referable ? "bg-[#fee2e2] text-status-critical" : "bg-slate-100 text-slate-600"
      }`}
    >
      {item.referable ? t("act.referable") : scanLabel(item.label)}
    </span>
  );
}
