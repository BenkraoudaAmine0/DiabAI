"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import Logo from "@/components/Logo";
import { LangToggle, useI18n } from "@/i18n";

/** Figma "Page new" public frame: 88px white header (logo · language ·
 *  one action), page content, #092b26 footer. */
export default function PublicShell({
  action,
  children,
}: {
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-pub-bg">
      <header className="flex h-[88px] shrink-0 items-center justify-between gap-2 border-b border-pub-line bg-white px-4 sm:px-[72px]">
        <Link href="/" aria-label="DiabAI" className="-ml-3 shrink-0 sm:ml-0">
          <span className="sm:hidden">
            <Logo variant="icon" height={48} />
          </span>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <LangToggle />
          {action && (
            <Link
              href={action.href}
              className="flex h-[42px] items-center rounded-xl border border-pub-field bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-pub-deep hover:bg-pub-mint-soft sm:px-[18px] sm:text-sm"
            >
              {action.label}
            </Link>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="flex min-h-[84px] flex-wrap items-center justify-between gap-4 bg-pub-dark px-4 py-6 sm:px-[72px]">
        <div className="flex items-center gap-3">
          <span className="h-7 w-2 rounded-full bg-pub-accent" aria-hidden />
          <p className="text-sm font-medium text-white">{t("pub.footer")}</p>
        </div>
        <nav className="flex gap-6 text-xs text-pub-mint-soft">
          <Link href="/#privacy" className="hover:text-white">
            {t("pub.privacy")}
          </Link>
          <Link href="/#disclaimer" className="hover:text-white">
            {t("pub.disclaimer")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}

/** Shared field styles of the public forms (Figma inputs: 50px, radius 12). */
export const pubInput =
  "h-[50px] w-full rounded-xl border border-pub-field bg-white px-4 text-sm text-pub-ink outline-none placeholder:text-pub-hint focus:border-pub-primary focus:ring-2 focus:ring-pub-primary/15";
export const pubLabel = "flex flex-col gap-2 text-sm font-semibold text-pub-ink";
export const pubPrimary =
  "flex h-[52px] w-full items-center justify-center rounded-xl bg-pub-primary px-6 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(8,61,50,0.07)] hover:opacity-95 disabled:opacity-50";
export const pubEyebrow = "text-xs font-bold uppercase tracking-[1.2px] text-pub-primary";

/** The "✓" privacy note block of the login/register frames. */
export function PrivacyNote({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-pub-mint-soft p-4">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-pub-mint text-sm font-bold text-pub-primary" aria-hidden>
        ✓
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-pub-ink">{title}</p>
        <p className="text-xs leading-[1.45] text-pub-muted">{text}</p>
      </div>
    </div>
  );
}
