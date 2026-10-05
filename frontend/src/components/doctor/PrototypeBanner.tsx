import { CircleAlert } from "lucide-react";

import { useI18n } from "@/i18n";

/** Figma "disclaimer-banner" (module pages): amber strip, centred text. */
export default function PrototypeBanner() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 rounded-lg border-y border-[#fde68a] bg-[#fffbeb] px-4 py-4 sm:px-10">
      <CircleAlert size={18} className="shrink-0 text-status-prediabetes" />
      <p className="text-center text-sm font-semibold text-status-prediabetes">{t("dr.banner")}</p>
    </div>
  );
}
