"use client";

import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileHeart,
  Footprints,
  House,
  MessageCircle,
  ScanFace,
  Settings,
} from "lucide-react";

import WorkspaceShell, { isNavActive, type ShellNavItem } from "@/components/WorkspaceShell";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useI18n } from "@/i18n";

// Patient portal sidebar: home, the patient's own results and photo
// checks, education, chat, settings
const NAV = [
  { href: "/patient", key: "pt.nav.home", icon: House, exact: true },
  { href: "/patient/history", key: "pt.nav.results", icon: FileHeart, also: ["/predictions"] },
  { href: "/patient/foot", key: "pt.nav.foot", icon: Footprints },
  { href: "/patient/neck", key: "pt.nav.neck", icon: ScanFace },
  { href: "/patient/learn", key: "pt.nav.learn", icon: BookOpen },
  { href: "/chat", key: "pt.nav.chat", icon: MessageCircle },
  { href: "/patient/settings", key: "pt.nav.settings", icon: Settings, also: ["/patient/notifications"] },
];

/** Patient portal in the shared workspace frame; the bell counts unread
 *  notifications. */
export default function PatientShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const { unread } = useNotifications(session?.user.id);

  const nav: ShellNavItem[] = NAV.map(({ key, ...item }) => ({ ...item, label: t(key) }));
  const active = nav.find((n) => isNavActive(n, pathname));
  const title = pathname === "/patient/notifications" ? t("pt.notif.title") : active?.label ?? t("pt.nav.home");

  return (
    <WorkspaceShell
      home="/patient"
      section={t("pt.nav.section")}
      nav={nav}
      title={title}
      roleLabel={t("role.patient")}
      menu={[{ href: "/patient/settings", label: t("pt.menu.settings"), icon: Settings }]}
      bell={{ href: "/patient/notifications", count: unread, label: t("pt.bell", { n: unread }) }}
    >
      {children}
    </WorkspaceShell>
  );
}
