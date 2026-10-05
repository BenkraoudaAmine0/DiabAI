"use client";

import Link from "next/link";

import PublicShell from "@/components/public/PublicShell";
import { useI18n } from "@/i18n";

/** Figma "Page new" · 404 FR (43:5). */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <PublicShell>
      <div className="flex flex-1 flex-col items-center gap-12 px-4 py-14 sm:px-12 lg:flex-row lg:gap-[88px] lg:px-[104px]">
        <div className="flex w-full max-w-[590px] shrink-0 flex-col gap-6">
          <span className="w-fit rounded-full bg-[#fdedea] px-3 py-[7px] text-xs font-bold uppercase tracking-[1.2px] text-pub-deep">
            {t("pub.nf.eyebrow")}
          </span>
          <p className="text-7xl font-bold leading-[0.95] tracking-[-3.84px] text-pub-primary sm:text-8xl">404</p>
          <div className="flex flex-col gap-4">
            <h1 className="text-[34px] font-bold leading-[1.12] tracking-[-0.88px] text-pub-dark sm:text-[44px]">{t("pub.nf.title")}</h1>
            <p className="text-lg leading-[1.55] text-pub-muted">{t("pub.nf.text")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="flex h-[52px] w-[190px] items-center justify-center rounded-xl bg-pub-primary text-sm font-semibold text-white shadow-[0_10px_30px_rgba(8,61,50,0.07)] hover:opacity-95"
            >
              {t("pub.nf.home")}
            </Link>
            <Link
              href="/login"
              className="flex h-[50px] w-[210px] items-center justify-center rounded-xl border border-pub-field bg-white text-sm font-semibold text-pub-deep hover:bg-pub-mint-soft"
            >
              {t("pub.login")}
            </Link>
          </div>
          <p className="text-sm leading-[1.5] text-pub-muted">{t("pub.nf.help")}</p>
        </div>

        <div
          className="flex h-[420px] w-full min-w-0 flex-1 flex-col justify-between rounded-[28px] bg-pub-dark p-10 shadow-[0_18px_50px_rgba(6,61,48,0.13)] lg:h-[500px]"
          aria-hidden
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#17483f] px-3 py-[7px] text-xs text-pub-mint">
              DiabAI <span className="font-semibold">/ 404</span>
            </span>
            <span className="size-3 rounded-full bg-pub-accent" />
          </div>
          <div className="flex flex-col items-center">
            <span className="size-[38px] rounded-full border-[3px] border-pub-mint bg-pub-accent" />
            <span className="h-[72px] w-[3px] rounded-full bg-pub-accent" />
            <span className="flex h-[94px] w-[210px] items-center justify-center rounded-[18px] border-2 border-dashed border-pub-accent bg-[#123e37] text-[40px] font-bold text-white">
              ?
            </span>
            <span className="h-[72px] w-[3px] rounded-full bg-[#31544e]" />
            <span className="size-[26px] rounded-full border-[3px] border-[#87a39d] bg-[#31544e]" />
          </div>
          <p className="text-center text-sm font-medium text-pub-mint">{t("pub.nf.route")}</p>
        </div>
      </div>
    </PublicShell>
  );
}
