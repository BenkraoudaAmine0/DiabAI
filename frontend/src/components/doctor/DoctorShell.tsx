"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CircleQuestionMark,
  Clock,
  Eye,
  FileText,
  Footprints,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import GlobalSearch from "@/components/GlobalSearch";
import SessionTimer from "@/components/SessionTimer";
import WorkspaceShell, { isNavActive, type ShellNavItem } from "@/components/WorkspaceShell";
import PendingApproval from "@/components/doctor/PendingApproval";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { APPROVAL_REQUIRED, api } from "@/lib/api";
import type { DoctorDashboard } from "@/lib/types";

// Figma 02 Doctor Screens · Sidebar-Nav, plus the foot & neck photo checks
const NAV = [
  { href: "/doctor/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/doctor/patients", key: "nav.patients", icon: UsersRound },
  { href: "/doctor/diabetes", key: "nav.evaluations", icon: FileText, also: ["/predictions", "/doctor/type-classification"] },
  { href: "/doctor/retina", key: "nav.retina", icon: Eye, also: ["/doctor/complications"] },
  { href: "/doctor/scans", key: "nav.scans", icon: Footprints },
  { href: "/chat", key: "nav.chat", icon: MessageSquare },
  { href: "/doctor/history", key: "nav.doctorHistory", icon: Clock },
  { href: "/doctor/settings", key: "nav.settings", icon: Settings, also: ["/profile"] },
  { href: "/doctor/help", key: "dr.nav.help", icon: CircleQuestionMark },
];

// what a doctor awaiting approval can open (guest access)
const GUEST_OPEN = ["/doctor/settings", "/profile", "/doctor/help"];

const REFRESH_MS = 120_000;
const APPROVAL_POLL_MS = 30_000;

function guestCanOpen(path: string): boolean {
  return GUEST_OPEN.some((p) => path === p || path.startsWith(p + "/"));
}

/** Clinician workspace in the shared frame: patient search in the top bar,
 *  the bell counts assessments awaiting review; signs out after 45 min idle.
 *  A doctor an admin has not approved yet browses as a guest: clinical
 *  pages show PendingApproval until the account is approved. */
export default function DoctorShell({ children }: { children: React.ReactNode }) {
  const { profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const [toReview, setToReview] = useState(0);
  // verified_at is null until an admin approves; undefined = no approval
  // step on this database yet (before migration 0013), like the backend
  const awaitingApproval = profile?.role === "doctor" && profile.verified_at === null;

  useEffect(() => {
    if (awaitingApproval) return;
    const load = () =>
      api<DoctorDashboard>("/api/dashboard/doctor")
        .then((d) => setToReview(d.kpis?.reviews?.pending ?? 0))
        .catch(() => setToReview(0));
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [awaitingApproval]);

  // an approval revoked while the doctor works: the API answers 403 with the
  // reason, so the workspace locks without waiting for a reload
  useEffect(() => {
    const onRevoked = () => void refreshProfile();
    window.addEventListener(APPROVAL_REQUIRED, onRevoked);
    return () => window.removeEventListener(APPROVAL_REQUIRED, onRevoked);
  }, [refreshProfile]);

  // the approval unlocks the workspace without signing in again
  useEffect(() => {
    if (!awaitingApproval) return;
    const id = window.setInterval(() => void refreshProfile(), APPROVAL_POLL_MS);
    return () => window.clearInterval(id);
  }, [awaitingApproval, refreshProfile]);

  const nav: ShellNavItem[] = [
    ...(profile?.role === "admin"
      ? [{ href: "/admin/dashboard", label: t("nav.admin"), icon: ShieldCheck, also: ["/admin"] }]
      : []),
    ...NAV.map(({ key, ...item }) => ({ ...item, label: t(key), locked: awaitingApproval && !guestCanOpen(item.href) })),
  ];
  const active = nav.find((n) => isNavActive(n, pathname));

  return (
    <WorkspaceShell
      home="/doctor/dashboard"
      section={t("dr.nav.section")}
      nav={nav}
      title={active?.label ?? t("nav.dashboard")}
      roleLabel={t(`role.${profile?.role ?? "doctor"}`)}
      menu={[{ href: "/doctor/settings", label: t("nav.settings"), icon: Settings }]}
      bell={awaitingApproval ? undefined : { href: "/doctor/dashboard", count: toReview, label: t("dr.bell", { n: toReview }) }}
      topbarExtra={awaitingApproval ? undefined : <GlobalSearch />}
      statusChip={
        awaitingApproval ? (
          <span
            title={t("dr.pending.chipHint")}
            className="flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fef3c7] px-3 py-1.5 text-xs font-bold text-status-prediabetes"
          >
            <Clock size={14} aria-hidden />
            <span className="sr-only sm:not-sr-only">{t("dr.pending.chip")}</span>
          </span>
        ) : undefined
      }
      footer={
        <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-6 text-[11px] text-slate-500">
          <span>{t("dr.footer.left")}</span>
          <span>{t("dr.footer.right")}</span>
        </footer>
      }
    >
      <SessionTimer />
      {awaitingApproval && !guestCanOpen(pathname) ? <PendingApproval /> : children}
    </WorkspaceShell>
  );
}
