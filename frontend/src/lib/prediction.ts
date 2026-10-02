import { downloadFile } from "@/lib/api";
import type { ReviewStatus, TopFactor } from "@/lib/types";

export type TierKey = "low" | "moderate" | "high" | "critical" | "prediabetic";

/** Backend tier label ("Prediabetic ⚠️", "High"…) → i18n / style key. */
export function tierKey(tier: string | null | undefined): TierKey {
  const t = (tier ?? "").toLowerCase();
  if (t.startsWith("prediabetic")) return "prediabetic";
  if (t === "moderate" || t === "high" || t === "critical") return t;
  return "low";
}

export const TIER_BADGE: Record<TierKey, string> = {
  low: "bg-emerald-100 text-emerald-800",
  moderate: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-700",
  prediabetic: "bg-yellow-100 text-yellow-800",
};

export const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  confirmed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

/** 12.3% · <0.1% · >99.9% — French uses a decimal comma and a space. */
export function formatPct(prob: number, lang: string): string {
  let text: string;
  if (prob > 0 && prob < 0.001) text = "<0.1%";
  else if (prob > 0.999 && prob < 1) text = ">99.9%";
  else text = `${(prob * 100).toFixed(1)}%`;
  return lang === "fr" ? text.replace(".", ",").replace("%", " %") : text;
}

export function formatNumber(value: number, lang: string): string {
  return value.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: 2,
  });
}

export function isRiskUp(factor: TopFactor): boolean {
  return factor.value > 0;
}

export async function downloadReport(id: string, lang: string): Promise<void> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await downloadFile(
    `/api/diabetes/predictions/${id}/report.pdf?lang=${lang}&tz=${encodeURIComponent(tz)}`,
    `diabai-report-${id.slice(0, 8)}.pdf`
  );
}
