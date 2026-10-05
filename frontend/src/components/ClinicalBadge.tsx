"use client";

import Icon from "@/components/Icon";
import { useI18n } from "@/i18n";
import { CLINICAL_BADGE } from "@/lib/clinical";
import type { ClinicalStatus } from "@/lib/types";

/** Figma status badge: 6px radius on the design-system tint. The dashboard
 *  uses it bare (11px); the patients table adds the 14px status icon (12px). */
export default function ClinicalBadge({
  status,
  withIcon = false,
}: {
  status: ClinicalStatus;
  withIcon?: boolean;
}) {
  const { t } = useI18n();
  const look = CLINICAL_BADGE[status] ?? CLINICAL_BADGE.none;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 font-bold ${
        withIcon ? "text-xs" : "text-[11px]"
      } ${look.cls}`}
    >
      {withIcon && <Icon name={look.icon} size={14} />}
      {t(`clinical.${status}`)}
    </span>
  );
}
