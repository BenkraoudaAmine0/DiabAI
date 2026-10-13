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
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
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

const REFRESH_MS = 120_000;

/** Clinician workspace in the shared frame: patient search in the top bar,
 *  the bell counts assessments awaiting review; signs out after 45 min idle. */
export default function DoctorShell({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const load = () =>
      api<DoctorDashboard>("/api/dashboard/doctor")
        .then((d) => setPending(d.kpis?.reviews?.pending ?? 0))
        .catch(() => setPending(0));
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const nav: ShellNavItem[] = [
    ...(profile?.role === "admin"
      ? [{ href: "/admin/dashboard", label: t("nav.admin"), icon: ShieldCheck, also: ["/admin"] }]
      : []),
    ...NAV.map(({ key, ...item }) => ({ ...item, label: t(key) })),
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
      bell={{ href: "/doctor/dashboard", count: pending, label: t("dr.bell", { n: pending }) }}
      topbarExtra={<GlobalSearch />}
      footer={
        <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-6 text-[11px] text-slate-500">
          <span>{t("dr.footer.left")}</span>
          <span>{t("dr.footer.right")}</span>
        </footer>
      }
    >
      <SessionTimer />
      {children}
    </WorkspaceShell>
  );
}
