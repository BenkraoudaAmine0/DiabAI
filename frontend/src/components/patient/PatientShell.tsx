"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  House,
  LogOut,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";

import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { initials } from "@/lib/clinical";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  also?: string[]; // other paths that highlight this item
}

// Figma 06 Patient Screens · sidebar (Home order)
const NAV: NavItem[] = [
  {
    href: "/patient",
    labelKey: "pt.nav.home",
    icon: House,
    also: ["/patient/history", "/patient/foot", "/patient/neck", "/predictions"],
  },
  { href: "/patient/questionnaire", labelKey: "pt.nav.questionnaire", icon: ClipboardList },
  { href: "/patient/learn", labelKey: "pt.nav.learn", icon: BookOpen },
  { href: "/chat", labelKey: "pt.nav.chat", icon: MessageCircle },
  {
    href: "/patient/settings",
    labelKey: "pt.nav.settings",
    icon: Settings,
    also: ["/patient/notifications"],
  },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  const prefixes = [item.href === "/patient" ? null : item.href, ...(item.also ?? [])];
  return prefixes.some((p) => p && (pathname === p || pathname.startsWith(p + "/")));
}

/** Avatar (Figma: 36px circle, #d6ebe5 fill, #0b6b5f ring) with a small
 *  account menu — the Figma header has no other way to sign out. */
function AvatarMenu() {
  const { profile, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border border-pt-primary bg-pt-mint text-xs font-bold text-pt-deep"
      >
        {initials(profile?.full_name ?? profile?.email)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-xl border border-pt-border bg-white py-1 shadow-[0_8px_24px_rgba(23,51,47,0.12)]"
        >
          <div className="border-b border-pt-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-pt-ink">{profile?.full_name ?? "—"}</p>
            <p className="truncate text-xs text-pt-muted">{profile?.email}</p>
          </div>
          <Link
            href="/patient/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-pt-ink hover:bg-pt-cream"
          >
            <Settings size={16} className="text-pt-muted" />
            {t("pt.menu.settings")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-pt-ink hover:bg-pt-cream"
          >
            <LogOut size={16} className="text-pt-muted" />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Patient portal frame — Figma 06 Patient Screens: 72px portal header
 *  (logo · language · avatar) over a 260px sidebar and the cream canvas. */
export default function PatientShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-pt-cream">
      <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-pt-border bg-white pl-2 pr-4 sm:pr-6 lg:pl-6">
        <Link href="/patient" aria-label="DiabAI">
          <span className="sm:hidden">
            <Logo variant="icon" height={56} />
          </span>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <LangToggle />
          <AvatarMenu />
        </div>
      </header>

      {/* mobile nav row (the sidebar needs ≥1024px) */}
      <nav className="flex gap-1 overflow-x-auto border-b border-pt-border bg-white px-3 py-2 lg:hidden">
        {NAV.map((item) => {
          const active = isActive(item, pathname);
          const IconCmp = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs ${
                active ? "bg-pt-mint font-bold text-pt-deep" : "font-medium text-pt-muted"
              }`}
            >
              <IconCmp size={16} />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-1">
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[260px] shrink-0 flex-col gap-2 border-r border-pt-border bg-white px-5 py-6 lg:flex">
          {NAV.map((item) => {
            const active = isActive(item, pathname);
            const IconCmp = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-sm transition-colors ${
                  active
                    ? "bg-pt-mint font-bold text-pt-deep"
                    : "font-medium text-pt-muted hover:bg-pt-cream hover:text-pt-ink"
                }`}
              >
                <IconCmp size={20} strokeWidth={1.75} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
