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
import { DOCTORS_CHANGED } from "@/lib/admin";
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

/** Admin console in the shared workspace frame; the bell lists doctors
 *  awaiting approval and open error alerts, the sidebar footer shows the
 *  API environment. */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [env, setEnv] = useState<{ environment?: string; version?: string } | null>(null);
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);
  const [waitingDoctors, setWaitingDoctors] = useState(0);

  useEffect(() => {
    api<{ environment?: string; version?: string }>("/api/health").then(setEnv).catch(() => setEnv(null));
  }, []);
  useEffect(() => {
    // the bell counts unresolved error alerts (refreshed on each page change)
    api<{ summary: { unresolved: number } }>("/api/admin/alerts?status=unresolved&period=all")
      .then((r) => setOpenAlerts(r.summary.unresolved))
      .catch(() => setOpenAlerts(null));
  }, [pathname]);
  useEffect(() => {
    // doctors who signed up and wait for approval (again after an approval)
    const load = () =>
      api<{ count: number }>("/api/admin/doctors/pending")
        .then((r) => setWaitingDoctors(r.count))
        .catch(() => setWaitingDoctors(0));
    load();
    window.addEventListener(DOCTORS_CHANGED, load);
    return () => window.removeEventListener(DOCTORS_CHANGED, load);
  }, [pathname]);

  const nav: ShellNavItem[] = NAV.map(({ href, key, icon }) => ({
    href,
    icon,
    label: t(`adm.nav.${key}`),
    badge: key === "doctors" ? waitingDoctors : undefined,
  }));
  const alerts = openAlerts ?? 0;
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
      bell={{
        href: "/admin/alerts",
        count: alerts + waitingDoctors,
        label: t("adm.bell.all", { n: alerts + waitingDoctors }),
        items: [
          { href: "/admin/doctors?state=pending", label: t("adm.bell.doctors"), count: waitingDoctors },
          { href: "/admin/alerts", label: t("adm.bell.alerts"), count: alerts },
        ],
      }}
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
