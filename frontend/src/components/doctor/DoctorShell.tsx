"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CircleQuestionMark,
  Clock,
  Eye,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import GlobalSearch from "@/components/GlobalSearch";
import Logo from "@/components/Logo";
import SessionTimer from "@/components/SessionTimer";
import { useAuth } from "@/contexts/AuthContext";
import { LangText, useI18n } from "@/i18n";
import { initials } from "@/lib/clinical";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  also?: string[]; // other paths that highlight this item
}

// Figma 02 Doctor Screens · Sidebar-Nav (8 items)
const NAV: NavItem[] = [
  { href: "/doctor/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/doctor/patients", labelKey: "nav.patients", icon: UsersRound },
  {
    href: "/doctor/diabetes",
    labelKey: "nav.evaluations",
    icon: FileText,
    also: ["/predictions", "/doctor/type-classification"],
  },
  {
    href: "/doctor/retina",
    labelKey: "nav.retina",
    icon: Eye,
    also: ["/doctor/complications", "/doctor/scans"],
  },
  { href: "/chat", labelKey: "nav.chat", icon: MessageSquare },
  { href: "/doctor/history", labelKey: "nav.doctorHistory", icon: Clock },
  { href: "/doctor/settings", labelKey: "nav.settings", icon: Settings, also: ["/profile"] },
  { href: "/doctor/help", labelKey: "dr.nav.help", icon: CircleQuestionMark },
];

function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

/** Sidebar footer "User-Profile-Minimal" + a small account menu. */
function UserCard() {
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg text-left hover:bg-white/50"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
          {initials(profile?.full_name ?? profile?.email)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-bold text-slate-900">{profile?.full_name ?? "—"}</span>
          <span className="truncate text-[11px] text-slate-500">{t(`role.${profile?.role ?? "doctor"}`)}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute bottom-11 left-0 z-30 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <Link
            href="/doctor/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Settings size={15} className="text-slate-400" />
            {t("nav.settings")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={15} className="text-slate-400" />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Doctor workspace frame — Figma 02 Doctor Screens: 260px #eaf5f1 sidebar,
 *  top bar (patient search · FR|EN), mini footer; signs out after 45 min idle. */
export default function DoctorShell({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const nav: NavItem[] =
    profile?.role === "admin"
      ? [{ href: "/admin/dashboard", labelKey: "nav.admin", icon: ShieldCheck, also: ["/admin"] }, ...NAV]
      : NAV;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-8 overflow-y-auto border-r border-slate-200 bg-[#eaf5f1] p-6 lg:flex">
        <Link href="/doctor/dashboard" className="-ml-4 -mt-4" aria-label="DiabAI">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = isActive(item, pathname);
            const IconCmp = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-[#e6f2eb] font-bold text-brand"
                    : "font-medium text-slate-700 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <IconCmp size={18} strokeWidth={1.8} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
          <UserCard />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile: logo + nav row */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#eaf5f1] pr-3 lg:hidden">
          <Logo variant="icon" height={56} />
          <UserCard />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          {nav.map((item) => {
            const active = isActive(item, pathname);
            const IconCmp = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${
                  active ? "bg-[#e6f2eb] font-bold text-brand" : "font-medium text-slate-600"
                }`}
              >
                <IconCmp size={14} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <GlobalSearch />
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:gap-5">
              <LangText />
              <SessionTimer />
            </div>
          </div>

          <div className="min-w-0 flex-1">{children}</div>

          <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-6 text-[11px] text-slate-500">
            <span>{t("dr.footer.left")}</span>
            <span>{t("dr.footer.right")}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
