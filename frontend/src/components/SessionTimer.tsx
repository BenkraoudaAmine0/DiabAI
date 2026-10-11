"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";

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

/** Signs the user out after 45 minutes without activity (mouse, keyboard,
 *  touch) in any tab of the app. Renders nothing: the countdown badge was
 *  removed from the top bar, the protection stays. */
export default function SessionTimer() {
  const { signOut } = useAuth();
  const router = useRouter();
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
      if (idleMs >= IDLE_MINUTES * 60_000) {
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

  return null;
}
