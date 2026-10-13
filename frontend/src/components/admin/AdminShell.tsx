"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  BrainCircuit,
  HeartPulse,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Users,
} from "lucide-react";

import WorkspaceShell, { isNavActive, type ShellNavItem } from "@/components/WorkspaceShell";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

// Figma 05 Admin Screens · Sidebar (9 items) + the knowledge base, which
// the AI assistant answers from
const NAV = [
  { href: "/admin/dashboard", key: "overview", icon: LayoutDashboard },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/doctors", key: "doctors", icon: Stethoscope },
  { href: "/admin/patients", key: "patients", icon: HeartPulse },
  { href: "/admin/audit", key: "audit", icon: ScrollText },
  { href: "/admin/models", key: "models", icon: BrainCircuit },
  { href: "/admin/health", key: "health", icon: Activity },
  { href: "/admin/alerts", key: "alerts", icon: TriangleAlert },
  { href: "/admin/security", key: "security", icon: ShieldCheck },
  { href: "/admin/knowledge", key: "knowledge", icon: BookOpen },
];

/** Admin console in the shared workspace frame; the bell counts open
 *  error alerts and the sidebar footer shows the API environment. */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [env, setEnv] = useState<{ environment?: string; version?: string } | null>(null);
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);

  useEffect(() => {
    api<{ environment?: string; version?: string }>("/api/health").then(setEnv).catch(() => setEnv(null));
  }, []);
  useEffect(() => {
    // the bell counts unresolved error alerts (refreshed on each page change)
    api<{ summary: { unresolved: number } }>("/api/admin/alerts?status=unresolved&period=all")
      .then((r) => setOpenAlerts(r.summary.unresolved))
      .catch(() => setOpenAlerts(null));
  }, [pathname]);

  const nav: ShellNavItem[] = NAV.map(({ href, key, icon }) => ({ href, icon, label: t(`adm.nav.${key}`) }));
  const active = nav.find((n) => isNavActive(n, pathname));

  return (
    <WorkspaceShell
      home="/admin/dashboard"
      section={t("adm.nav.section")}
      nav={nav}
      title={active?.label ?? t("adm.brand")}
      roleLabel={t("adm.role")}
      menu={[
        { href: "/doctor/dashboard", label: t("adm.menu.clinical"), icon: Stethoscope },
        { href: "/doctor/settings", label: t("nav.settings"), icon: Settings },
      ]}
      bell={{ href: "/admin/alerts", count: openAlerts ?? 0, label: t("adm.bell", { n: openAlerts ?? 0 }) }}
      sidebarFooter={
        <div className="flex items-center gap-2.5 rounded-lg bg-white/70 p-3">
          <span className={`size-2 shrink-0 rounded-full ${env ? "bg-status-normal" : "bg-slate-400"}`} aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-xs font-semibold capitalize text-slate-900">{env?.environment ?? t("adm.envUnknown")}</p>
            <p className="truncate text-[11px] text-slate-500">{env?.version ? `API v${env.version}` : "API —"}</p>
          </div>
        </div>
      }
      contentClassName="flex flex-col gap-[18px]"
    >
      {children}
    </WorkspaceShell>
  );
}
