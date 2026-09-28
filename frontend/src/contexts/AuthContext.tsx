"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

interface Auth {
  session: { user: { id: string; email?: string } } | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile((data as Profile) ?? null);
  }, [userId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email);
      if (!data.session) setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email);
      if (!session) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshProfile();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setProfile(null);
    setUserId(null);
  }, []);

  const value = useMemo(
    () => ({
      session: userId ? { user: { id: userId, email } } : null,
      profile,
      loading,
      refreshProfile,
      signOut,
    }),
    [userId, email, profile, loading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
