"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import Logo from "@/components/Logo";

interface NavItem {
  href: string;
  labelKey: string;
  icon: string;
}

const DOCTOR_NAV: NavItem[] = [
  { href: "/doctor/dashboard", labelKey: "nav.dashboard", icon: "▦" },
  { href: "/doctor/patients", labelKey: "nav.patients", icon: "👥" },
  { href: "/doctor/diabetes", labelKey: "nav.diabetes", icon: "🩺" },
  { href: "/doctor/retina", labelKey: "nav.retina", icon: "👁" },
  { href: "/doctor/scans", labelKey: "nav.scans", icon: "🦶" },
  { href: "/chat", labelKey: "nav.chat", icon: "💬" },
  { href: "/profile", labelKey: "nav.profile", icon: "⚙" },
];

const PATIENT_NAV: NavItem[] = [
  { href: "/patient", labelKey: "nav.home", icon: "🏠" },
  { href: "/patient/foot", labelKey: "nav.foot", icon: "🦶" },
  { href: "/patient/neck", labelKey: "nav.neck", icon: "🧣" },
  { href: "/patient/history", labelKey: "nav.history", icon: "📋" },
  { href: "/chat", labelKey: "nav.chat", icon: "💬" },
  { href: "/profile", labelKey: "nav.profile", icon: "⚙" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const isDoctor = profile?.role === "doctor" || profile?.role === "admin";
  const isAdmin = profile?.role === "admin";
  const home = isAdmin ? "/admin/dashboard" : isDoctor ? "/doctor/dashboard" : "/patient";
  const nav = isDoctor
    ? isAdmin
      ? [
          { href: "/admin/dashboard", labelKey: "nav.admin", icon: "🛡" },
          ...DOCTOR_NAV,
        ]
      : DOCTOR_NAV
    : PATIENT_NAV;

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5">
          <Link href={home}>
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/patient" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span aria-hidden className="w-5 text-center">
                  {item.icon}
                </span>
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-800">
            {profile?.full_name ?? "…"}
          </p>
          <p className="truncate text-xs text-slate-500">{profile?.email}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("common.logout")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar (mobile nav + lang toggle) */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Link href={home}>
              <Logo size={30} />
            </Link>
          </div>
          <div className="hidden gap-1 lg:flex lg:pl-0">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-teal-50 text-teal-700"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <LangToggle compact />
            <button
              onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              {t("common.logout")}
            </button>
          </div>
        </header>

        {/* mobile nav row */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
