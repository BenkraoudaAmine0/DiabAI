"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  BookOpen,
  BrainCircuit,
  Building2,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { initials } from "@/lib/clinical";

interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

// Figma 05 Admin Screens · Sidebar (9 items) + the knowledge base, which
// the AI assistant answers from
const NAV: NavItem[] = [
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

function current(pathname: string): NavItem | undefined {
  return NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
}

function ProfileMenu() {
  const { profile, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-adm-ink hover:bg-adm-soft";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2.5 text-left">
        <span className="flex size-9 items-center justify-center rounded-full bg-adm-tint text-xs font-bold text-adm-teal">
          {initials(profile?.full_name ?? profile?.email)}
        </span>
        <span className="hidden flex-col gap-px sm:flex">
          <span className="max-w-[160px] truncate text-xs font-semibold text-adm-ink">{profile?.full_name ?? profile?.email}</span>
          <span className="text-[11px] text-adm-muted">{t("adm.role")}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-[10px] border border-adm-border bg-white py-1 shadow-lg">
          <Link href="/doctor/dashboard" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Stethoscope size={15} className="text-adm-muted" />
            {t("adm.menu.clinical")}
          </Link>
          <Link href="/doctor/settings" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Settings size={15} className="text-adm-muted" />
            {t("nav.settings")}
          </Link>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
          >
            <LogOut size={15} className="text-adm-muted" />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Admin workspace — Figma 05 Admin Screens: 260px #102d35 sidebar,
 *  76px white top bar (breadcrumb · language · alerts · profile). */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const active = current(pathname);
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

  const nav = (compact: boolean) =>
    NAV.map((item) => {
      const on = item === active;
      const IconCmp = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={on ? "page" : undefined}
          className={
            compact
              ? `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${on ? "bg-adm-side-active font-semibold text-white" : "text-adm-side-muted"}`
              : `flex h-[45px] items-center gap-[11px] rounded-[10px] px-[13px] text-[13px] transition-colors ${
                  on ? "bg-adm-side-active font-semibold text-white" : "text-adm-side-muted hover:bg-white/5 hover:text-white"
                }`
          }
        >
          <IconCmp size={compact ? 14 : 18} strokeWidth={1.8} />
          {t(`adm.nav.${item.key}`)}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen bg-adm-bg">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-4 overflow-y-auto bg-adm-side px-[18px] pb-5 pt-[18px] lg:flex">
        <Link href="/admin/dashboard" aria-label="DiabAI" className="-ml-1">
          <Logo tone="light" />
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.88px] text-adm-side-muted">{t("adm.nav.section")}</p>
        <nav className="flex flex-col gap-[5px]">{nav(false)}</nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 rounded-[10px] bg-white/5 p-3">
          <span className={`size-2 shrink-0 rounded-full ${env ? "bg-[#3ccf91]" : "bg-adm-side-muted"}`} aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-xs font-semibold capitalize text-white">{env?.environment ?? t("adm.envUnknown")}</p>
            <p className="truncate text-[11px] text-adm-side-muted">{env?.version ? `API v${env.version}` : "API —"}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] items-center justify-between gap-3 border-b border-adm-border bg-white px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
            <span className="lg:hidden">
              <Logo variant="icon" height={44} />
            </span>
            <Building2 size={18} className="hidden shrink-0 text-adm-teal lg:block" />
            <span className="hidden text-adm-muted sm:inline">{t("adm.brand")}</span>
            <span className="hidden text-adm-border sm:inline">/</span>
            <span className="truncate font-semibold text-adm-ink">{active ? t(`adm.nav.${active.key}`) : t("adm.brand")}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <LangToggle />
            <Link
              href="/admin/alerts"
              aria-label={t("adm.bell", { n: openAlerts ?? 0 })}
              title={t("adm.bell", { n: openAlerts ?? 0 })}
              className="relative flex size-9 items-center justify-center rounded-[10px] bg-adm-soft text-adm-muted hover:text-adm-ink"
            >
              <Bell size={18} />
              {!!openAlerts && (
                <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-adm-red px-1 text-[10px] font-bold text-white">
                  {openAlerts > 99 ? "99+" : openAlerts}
                </span>
              )}
            </Link>
            <span className="hidden h-7 w-px bg-adm-border sm:block" aria-hidden />
            <ProfileMenu />
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto bg-adm-side px-3 py-2 lg:hidden">{nav(true)}</nav>

        <main className="flex min-w-0 flex-1 flex-col gap-[18px] px-4 py-6 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
