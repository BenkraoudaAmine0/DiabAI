/** Small formatting helpers shared by the patient portal pages. */

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
