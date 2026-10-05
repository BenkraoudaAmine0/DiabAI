import type { IconName } from "@/components/Icon";
import type { ClinicalStatus } from "@/lib/types";

/** Badge look of each clinical status (Figma: Statut clinique). */
// Figma 04 Design System status colours (Normal / Prédiabète / Diabète T2 /
// Critique / Insuffisant) on their light tints, as in the dashboard badges
export const CLINICAL_BADGE: Record<ClinicalStatus, { cls: string; icon: IconName }> = {
  diabetic: { cls: "bg-[#ffedd5] text-status-diabetes", icon: "activity" },
  moderate: { cls: "bg-[#fff7ed] text-[#c2410c]", icon: "alertTriangle" },
  prediabetic: { cls: "bg-[#fef3c7] text-status-prediabetes", icon: "alertCircle" },
  normal: { cls: "bg-[#dcfce7] text-status-normal", icon: "checkCircle" },
  none: { cls: "bg-slate-100 text-status-insufficient", icon: "clock" },
};

/** Lowercase without accents, for client-side search: "Smaïl" → "smail". */
export function fold(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function initials(name: string | null | undefined): string {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The 8-character patient ID shown across the app (and searchable). */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/** "Aujourd'hui, 11:24" · "Hier, 16:30" · "12 nov. 2026, 09:15" */
export function whenLabel(iso: string | null | undefined, lang: string, t: T): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, new Date())) return t("time.today", { time });
  if (sameDay(d, yesterday)) return t("time.yesterday", { time });
  return `${d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}, ${time}`;
}

/** "Aujourd'hui" · "Hier" · "12 nov. 2026" */
export function dayLabel(iso: string | null | undefined, lang: string, t: T): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, new Date())) return t("time.todayShort");
  if (sameDay(d, yesterday)) return t("time.yesterdayShort");
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/** Scan result label from the model ("moderate_dr" → "Moderate dr"). */
export function scanLabel(label: string | null | undefined): string {
  const text = (label ?? "—").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Mirror of backend clinical_status(): status of a patient from their
 *  latest prediction (the model is binary + risk tiers). */
export function clinicalStatusOf(
  pred: { prediction: number; risk_tier: string } | null | undefined
): ClinicalStatus {
  if (!pred) return "none";
  if (pred.prediction === 1) return "diabetic";
  const tier = (pred.risk_tier ?? "").toLowerCase();
  if (tier.startsWith("prediabetic")) return "prediabetic";
  if (["moderate", "high", "critical"].includes(tier)) return "moderate";
  return "normal";
}

/** Age in whole years from an ISO date of birth (null when unknown). */
export function age(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 ? years : null;
}
