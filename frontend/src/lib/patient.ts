/** Small formatting helpers shared by the patient portal pages. */

import type { NotificationItem } from "@/lib/types";

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "pt.home.morning" | "pt.home.afternoon" | "pt.home.evening" */
export function greetingKey(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "pt.home.morning" : h < 18 ? "pt.home.afternoon" : "pt.home.evening";
}

/** Figma style "18 Sep 2026" / "18 sept. 2026". */
export function shortDate(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function timeOfDay(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Notification card corner: "09:15" today, "Yesterday", weekday this week, else date. */
export function notificationWhen(
  iso: string,
  lang: string,
  yesterday: string,
  now: Date = new Date()
): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return timeOfDay(iso, lang);
  if (days === 1) return yesterday;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  if (days < 7) return d.toLocaleDateString(locale, { weekday: "short" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

const FRIENDLY_KEY = "diabai-friendly-chat";

/** Settings › "Friendly explanations" (Figma default: on). Per-browser. */
export function readFriendly(): boolean {
  try {
    return window.localStorage.getItem(FRIENDLY_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeFriendly(on: boolean): void {
  try {
    window.localStorage.setItem(FRIENDLY_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable: the toggle still works for this page view */
  }
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Notification wording shared by the home card and the notifications page. */
export function notificationTitle(t: Translate, kind: NotificationItem["kind"]): string {
  if (kind === "visit_reminder") return t("pt.notif.visitTitle");
  if (kind === "panel_added") return t("pt.notif.careTitle");
  return t("pt.notif.resultTitle");
}

export function notificationBody(t: Translate, lang: string, n: NotificationItem): string {
  if (n.kind === "visit_reminder" && n.data?.at) {
    return t("pt.notif.visitBody", { date: shortDate(n.data.at, lang) ?? "", time: timeOfDay(n.data.at, lang) });
  }
  const scan = n.data?.scan ? t(`scanShort.${n.data.scan}`) : "";
  return t(`notif.${n.kind}`, { doctor: n.data?.doctor ?? "", scan });
}

/** Body mass index from kg and cm (one decimal), or null. */
export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}
