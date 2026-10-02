"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { useNotifications } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/lib/types";

const KIND_ICONS: Record<string, string> = {
  prediction_recorded: "🩺",
  scan_recorded: "👁",
  panel_added: "👋",
};

function timeAgo(iso: string, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang === "fr" ? "fr" : "en", {
    numeric: "auto",
  });
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

function itemTitle(n: NotificationItem, t: (k: string, v?: Record<string, string>) => string): string {
  const scan = n.data?.scan ? t(`scanShort.${n.data.scan}`) : "";
  return t(`notif.${n.kind}`, {
    doctor: n.data?.doctor ?? "",
    scan,
  });
}

export default function NotificationBell() {
  const { session } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { notifications, unread, loaded, markRead, markAllRead } =
    useNotifications(session?.user.id);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.read) await markRead([n.id]);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("notif.title")}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a6 6 0 00-6 6v3.2c0 .5-.2 1-.5 1.4L4 16h16l-1.5-2.4a2.5 2.5 0 01-.5-1.4V9a6 6 0 00-6-6zM9.8 19a2.3 2.3 0 004.4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">{t("notif.title")}</p>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                {t("notif.markAll")}
              </button>
            )}
          </div>

          <div className="scroll-slim max-h-96 overflow-y-auto">
            {loaded && notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                {t("notif.empty")}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => void openItem(n)}
                  className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 ${
                    n.read ? "" : "bg-teal-50/50"
                  }`}
                >
                  <span className="mt-0.5 text-lg" aria-hidden>
                    {KIND_ICONS[n.kind] ?? "🔔"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-slate-800">
                      {itemTitle(n, t)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {timeAgo(n.created_at, lang)}
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
