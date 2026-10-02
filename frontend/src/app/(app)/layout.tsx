"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

/** Layout for every signed-in area: waits for the profile, enforces the
 * doctor/patient boundary, then renders inside the app shell. */
export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, profile, profileError, loading, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !session) return;
    if (!profile) return;
    // admin has full doctor-level access + its own area
    const doctorLevel = profile.role === "doctor" || profile.role === "admin";
    if (pathname.startsWith("/admin") && profile.role !== "admin") {
      router.replace(doctorLevel ? "/doctor/dashboard" : "/patient");
    }
    if (pathname.startsWith("/doctor") && !doctorLevel) {
      router.replace("/patient");
    }
    if (pathname.startsWith("/patient") && profile.role !== "patient") {
      router.replace(profile.role === "admin" ? "/admin/dashboard" : "/doctor/dashboard");
    }
  }, [loading, session, profile, pathname, router]);

  // signed in, but no profile row: without this the spinner never stops
  if (session && !loading && !profile && profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">{t("auth.noProfileTitle")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("auth.noProfileDesc")}</p>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
            {profileError}
          </p>
          <button
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("common.logout")}
          </button>
        </div>
      </div>
    );
  }

  if (!session || loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
