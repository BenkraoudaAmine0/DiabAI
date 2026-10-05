"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import LearnIcon from "@/components/patient/LearnIcon";
import { useI18n } from "@/i18n";
import { LEARN_TOPICS } from "@/lib/learn";

/** Figma 06 Patient Screens · Learn (122:16720). */
export default function LearnPage() {
  const { t, lang } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[40px] font-bold leading-[1.15] text-pt-ink">{t("pt.learn.title")}</h1>
        <p className="text-[15px] leading-[1.45] text-pt-muted">{t("pt.learn.subtitle")}</p>
      </div>
      <div className="flex flex-col gap-4">
        {LEARN_TOPICS.map((topic) => (
          <Link
            key={topic.slug}
            href={`/patient/learn/${topic.slug}`}
            className="flex w-full items-center gap-4 rounded-2xl border border-pt-border bg-white p-4 transition-colors hover:border-pt-primary/40"
          >
            <LearnIcon icon={topic.icon} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-base font-bold text-pt-ink">{topic.title[lang]}</span>
              <span className="text-sm leading-[1.35] text-pt-muted">{topic.summary[lang]}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-pt-deep" />
          </Link>
        ))}
      </div>
    </div>
  );
}
