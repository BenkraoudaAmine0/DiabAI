"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Lock, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from "lucide-react";

import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { LangToggle, useI18n } from "@/i18n";
import { initials } from "@/lib/clinical";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  also?: string[]; // other paths that highlight this item
  exact?: boolean; // highlight on the exact path only (a section home)
  locked?: boolean; // shown but not usable yet (a doctor awaiting approval)
  badge?: number; // a count to act on, e.g. doctors awaiting approval
}

export interface ShellBell {
  href: string;
  count: number;
  label: string;
  items?: { href: string; label: string; count: number }[]; // opens a short list instead
}

export interface ShellLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

// desktop sidebar folded to an icon rail — remembered per browser
const COLLAPSED_KEY = "diabai-sidebar-collapsed";
const COLLAPSED_EVENT = "diabai:sidebar";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_EVENT, onChange);
  };
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    /* private mode: the choice just isn't remembered */
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

export function isNavActive(item: ShellNavItem, pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  return (item.exact ? pathname === item.href : under(item.href)) || (item.also ?? []).some(under);
}

function BellBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-status-critical px-1 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** The bell: a link, or a short list when it gathers several kinds of item. */
function BellMenu({ bell }: { bell: ShellBell }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const cls = "relative flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900";
  if (!bell.items?.length) {
    return (
      <Link href={bell.href} aria-label={bell.label} title={bell.label} className={cls}>
        <Bell size={18} />
        <BellBadge count={bell.count} />
      </Link>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={bell.label} title={bell.label} className={cls}>
        <Bell size={18} />
        <BellBadge count={bell.count} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {bell.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span>{item.label}</span>
              {item.count > 0 && (
                <span className="rounded-full bg-status-critical px-2 py-0.5 text-[11px] font-bold text-white">{item.count}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Avatar · name · role in the top bar, with the account menu. */
function ProfileMenu({ roleLabel, links }: { roleLabel: string; links: ShellLink[] }) {
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

  const item = "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg p-1 text-left hover:bg-slate-50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
          {initials(profile?.full_name ?? profile?.email)}
        </span>
        <span className="hidden min-w-0 flex-col gap-px md:flex">
          <span className="max-w-[170px] truncate text-[13px] font-semibold text-slate-900">{profile?.full_name ?? profile?.email}</span>
          <span className="text-[11px] text-slate-500">{roleLabel}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{profile?.full_name ?? "—"}</p>
            <p className="truncate text-xs text-slate-500">{profile?.email}</p>
          </div>
          {links.map(({ href, label, icon: IconCmp }) => (
            <Link key={href} href={href} role="menuitem" className={item} onClick={() => setOpen(false)}>
              <IconCmp size={16} className="text-slate-400" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
          >
            <LogOut size={16} className="text-slate-400" />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarBody({
  home,
  section,
  nav,
  pathname,
  footer,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  home: string;
  section: string;
  nav: ShellNavItem[];
  pathname: string;
  footer?: React.ReactNode;
  onNavigate?: () => void;
  collapsed?: boolean; // icon rail: labels become tooltips
  onToggleCollapse?: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className={`flex shrink-0 items-center pt-3 ${collapsed ? "flex-col gap-2 px-2" : "justify-between px-4"}`}>
        <Link href={home} aria-label="DiabAI" onClick={onNavigate} className={collapsed ? "self-center" : ""}>
          {collapsed ? <Logo variant="icon" height={52} /> : <Logo height={60} />}
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t(collapsed ? "shell.expand" : "shell.collapse")}
            title={t(collapsed ? "shell.expand" : "shell.collapse")}
            className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/70 hover:text-slate-900 transition-colors"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
      </div>
      <p className={`shrink-0 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.88px] text-slate-500 ${collapsed ? "sr-only" : "px-7"}`}>
        {section}
      </p>
      {/* only the links scroll; logo and footer stay put */}
      <nav className={`scroll-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 ${collapsed ? "px-3" : "px-4"}`}>
        <ul className="flex flex-col gap-1">
          {nav.map((item) => {
            const on = isNavActive(item, pathname);
            const IconCmp = item.icon;
            const hint = item.locked ? `${item.label} · ${t("shell.locked")}` : collapsed ? item.label : undefined;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  aria-label={hint}
                  title={hint}
                  className={`relative flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors ${collapsed ? "justify-center" : "px-4"} ${
                    on
                      ? "bg-white font-bold text-brand shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : item.locked
                        ? "font-medium text-slate-400 hover:bg-white/40"
                        : "font-medium text-slate-700 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <IconCmp size={18} strokeWidth={1.8} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.locked && <Lock size={14} className="ml-auto shrink-0" aria-hidden />}
                  {!!item.badge && (
                    <span
                      className={`flex min-w-[20px] items-center justify-center rounded-full bg-status-critical px-1.5 text-[11px] font-bold text-white ${
                        collapsed ? "absolute right-1 top-1" : "ml-auto"
                      }`}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && <div className={`shrink-0 border-t border-slate-200 py-4 ${collapsed ? "px-3" : "px-4"}`}>{footer}</div>}
    </>
  );
}

/** The one frame every signed-in area uses (patient, doctor, admin): a
 *  260px light-mint sidebar (logo · section · scrollable links · footer),
 *  a white top bar (title · extra · EN|FR · bell · profile) and the
 *  slate canvas. On desktop the sidebar folds to an icon rail; below
 *  1024px it becomes a drawer that slides in. */
export default function WorkspaceShell({
  home,
  section,
  nav,
  title,
  roleLabel,
  menu,
  bell,
  topbarExtra,
  statusChip,
  sidebarFooter,
  footer,
  contentClassName = "",
  children,
}: {
  home: string;
  section: string;
  nav: ShellNavItem[];
  title: string;
  roleLabel: string;
  menu: ShellLink[];
  bell?: ShellBell;
  topbarExtra?: React.ReactNode;
  statusChip?: React.ReactNode; // e.g. a doctor's "awaiting approval" badge
  sidebarFooter?: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [animate, setAnimate] = useState(false); // only when toggled, not on page load

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-pt-mint-soft lg:flex ${
          animate ? "transition-[width] duration-200 ease-out" : ""
        } ${collapsed ? "w-[76px]" : "w-[260px]"}`}
      >
        <SidebarBody
          home={home}
          section={section}
          nav={nav}
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapse={() => {
            setAnimate(true);
            writeCollapsed(!collapsed);
          }}
          footer={!collapsed && sidebarFooter ? <div className="flex flex-col gap-3">{sidebarFooter}</div> : undefined}
        />
      </aside>

      {/* phone / tablet: the same sidebar slides in from the left */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawer ? "" : "pointer-events-none"}`}
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer || undefined}
        aria-label={section}
        aria-hidden={!drawer}
        inert={!drawer}
      >
        <button
          type="button"
          aria-label={t("shell.close")}
          onClick={() => setDrawer(false)}
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${drawer ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`relative flex h-full w-[280px] max-w-[85vw] flex-col bg-pt-mint-soft shadow-xl transition-transform duration-200 ease-out ${
            drawer ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label={t("shell.close")}
            className="absolute right-3 top-5 z-10 rounded-lg p-2 text-slate-500 hover:bg-white/70"
          >
            <X size={18} />
          </button>
          <SidebarBody
            home={home}
            section={section}
            nav={nav}
            pathname={pathname}
            onNavigate={() => setDrawer(false)}
            footer={
              <div className="flex flex-col gap-3">
                <LangToggle className="sm:hidden" />
                {sidebarFooter}
              </div>
            }
          />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label={t("shell.menu")}
            aria-expanded={drawer}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <p className="truncate text-[15px] font-semibold text-slate-900">{title}</p>
            {topbarExtra && <div className="hidden min-w-0 flex-1 md:block">{topbarExtra}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {statusChip}
            <LangToggle className="hidden sm:flex" />
            {bell && <BellMenu bell={bell} />}
            <span className="hidden h-7 w-px bg-slate-200 sm:block" aria-hidden />
            <ProfileMenu roleLabel={roleLabel} links={menu} />
          </div>
        </header>

        <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className={`mx-auto w-full min-w-0 max-w-[1400px] flex-1 ${contentClassName}`}>{children}</div>
          {footer && <div className="mx-auto w-full max-w-[1400px]">{footer}</div>}
        </main>
      </div>
    </div>
  );
}
