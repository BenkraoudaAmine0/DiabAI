"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";

interface NotificationsResponse {
  notifications: NotificationItem[];
  unread: number;
}

/** In-app notifications with live updates: initial fetch + Supabase
 * Realtime INSERT subscription (RLS-filtered to the current user) + a
 * 60s refetch as a fallback if Realtime is unavailable. */
export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const refetch = useRef<() => void>(() => {});

  useEffect(() => {
    if (!userId) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function load() {
      try {
        const res = await api<NotificationsResponse>("/api/notifications");
        if (cancelled) return;
        setNotifications(res.notifications);
        setUnread(res.unread);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }
    refetch.current = () => void load();
    void load();

    // live INSERTs for this user
    channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationItem;
          setNotifications((prev) => [row, ...prev].slice(0, 50));
          setUnread((u) => u + 1);
        }
      )
      .subscribe();

    // fallback refresh (Realtime off / hiccup)
    const interval = setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await api("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
    setUnread((u) => Math.max(0, u - ids.length));
  }, []);

  const markAllRead = useCallback(async () => {
    await api("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }, []);

  return { notifications, unread, loaded, markRead, markAllRead };
}
