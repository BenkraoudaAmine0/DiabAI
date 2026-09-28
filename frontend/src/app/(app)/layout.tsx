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
  const { session, profile, loading } = useAuth();
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
