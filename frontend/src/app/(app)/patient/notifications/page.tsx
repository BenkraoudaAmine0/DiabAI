"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, ScanEye, UserRound, type LucideIcon } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useI18n } from "@/i18n";
import { notificationBody, notificationTitle, notificationWhen } from "@/lib/patient";
import type { NotificationItem } from "@/lib/types";

type Filter = "all" | "reminder" | "education";
type Category = "reminder" | "education" | "result" | "care";

const CATEGORY: Record<NotificationItem["kind"], Category> = {
  visit_reminder: "reminder",
  prediction_recorded: "result",
  scan_recorded: "result",
  panel_added: "care",
};

const ICON: Record<NotificationItem["kind"], LucideIcon> = {
  visit_reminder: CalendarDays,
  prediction_recorded: ClipboardCheck,
  scan_recorded: ScanEye,
  panel_added: UserRound,
};

/** Figma tag colours: reminder #0b6b5f, education #a96312. */
const TAG_TEXT: Record<Category, string> = {
  reminder: "text-pt-primary",
  result: "text-pt-primary",
  care: "text-pt-primary",
  education: "text-[#a96312]",
};

/** Figma 06 Patient Screens · Notifications (122:17157). Results and care-team
 *  messages appear under "All"; the Figma filters stay Reminders / Education. */
export default function PatientNotificationsPage() {
  const { session } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { notifications, loaded, markRead } = useNotifications(session?.user.id);
  const [filter, setFilter] = useState<Filter>("all");

  const shown = notifications.filter((n) => filter === "all" || CATEGORY[n.kind] === filter);

  const title = (n: NotificationItem) => notificationTitle(t, n.kind);
  const body = (n: NotificationItem) => notificationBody(t, lang, n);

  async function open(n: NotificationItem) {
    if (!n.read) await markRead([n.id]);
    if (n.link && n.link !== "/patient/notifications") router.push(n.link);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-bold text-pt-ink">{t("pt.notif.title")}</h1>
        <p className="text-base text-pt-muted">{t("pt.notif.subtitle")}</p>
      </div>

      <div className="flex w-full gap-1 rounded-xl border border-pt-border bg-white p-1" role="tablist">
        {(["all", "reminder", "education"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
              filter === f ? "bg-pt-primary text-white" : "text-pt-muted hover:text-pt-ink"
            }`}
          >
            {t(f === "all" ? "pt.notif.all" : f === "reminder" ? "pt.notif.reminders" : "pt.notif.education")}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-[118px] animate-pulse rounded-2xl border border-pt-border bg-white" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-pt-border bg-white px-4 py-10 text-center text-sm text-pt-muted">
          {t("pt.notif.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((n) => {
            const category = CATEGORY[n.kind];
            const IconCmp = category === "education" ? BookOpen : ICON[n.kind];
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition-colors ${
                  n.read
                    ? "border-pt-border bg-white hover:border-pt-primary/40"
                    : "border-[#bddcd4] bg-pt-mint-soft hover:border-pt-primary/50"
                }`}
              >
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                    category === "education" ? "bg-[#fbe8c5] text-[#a96312]" : "bg-pt-mint text-pt-deep"
                  }`}
                >
                  <IconCmp size={24} strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {!n.read && <span className="size-2 shrink-0 rounded-full bg-pt-primary" aria-hidden />}
                      <span className="truncate text-[15px] font-bold text-pt-ink">{title(n)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-pt-muted">
                      {notificationWhen(n.created_at, lang, t("pt.notif.yesterday"))}
                    </span>
                  </span>
                  <span className="text-sm leading-[1.4] text-pt-muted">{body(n)}</span>
                  <span className={`text-[11px] font-semibold ${TAG_TEXT[category]}`}>
                    {t(`pt.notif.tag.${category}`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
