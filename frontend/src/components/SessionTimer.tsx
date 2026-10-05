"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Icon from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

const IDLE_MINUTES = 45;
const KEY = "diabai-last-activity"; // shared by every open tab
const EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Figma "Session-Timer": signs the user out after 45 minutes without
 *  activity (mouse, keyboard, touch) in any tab of the app, and shows the
 *  minutes left — amber in the last 5. */
export default function SessionTimer() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const router = useRouter();
  const [left, setLeft] = useState(IDLE_MINUTES);
  const last = useRef(0);

  useEffect(() => {
    last.current = Date.now();
    let written = 0;
    const bump = () => {
      const now = Date.now();
      last.current = now;
      if (now - written > 10_000) {  // don't hammer localStorage on mousemove
        written = now;
        try {
          window.localStorage.setItem(KEY, String(now));
        } catch {
          /* private mode: this tab's own activity still counts */
        }
      }
    };
    bump();
    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const tick = window.setInterval(async () => {
      const idleMs = Date.now() - Math.max(last.current, readShared());
      const remaining = IDLE_MINUTES - idleMs / 60_000;
      setLeft(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) {
        window.clearInterval(tick);
        await signOut();
        router.push("/login");
      }
    }, 15_000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(tick);
    };
  }, [signOut, router]);

  const low = left <= 5;
  return (
    <span
      title={t("session.title")}
      className={`hidden items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-semibold text-status-prediabetes sm:inline-flex ${
        low ? "bg-amber-200" : "bg-[#fef3c7]"
      }`}
    >
      <Icon name="clock" size={12} />
      {t("session.left", { m: left })}
    </span>
  );
}
