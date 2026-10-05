"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";

import LearnIcon from "@/components/patient/LearnIcon";
import { useI18n } from "@/i18n";
import { learnTopic } from "@/lib/learn";

/** One Learn article — same palette and cards as the Learn list. */
export default function LearnArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const topic = learnTopic(slug);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/patient/learn"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-pt-primary hover:underline"
      >
        <ArrowLeft size={16} />
        {t("pt.learn.back")}
      </Link>

      {!topic ? (
        <p className="text-pt-muted">{t("pt.notif.empty")}</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <LearnIcon icon={topic.icon} />
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.6px] text-pt-primary">
                {t("pt.home.readTime", { n: topic.minutes })}
              </p>
              <h1 className="text-[32px] font-bold leading-[1.15] text-pt-ink">{topic.title[lang]}</h1>
            </div>
          </div>

          <article className="flex flex-col gap-4">
            {topic.sections[lang].map((section) => (
              <section key={section.heading} className="rounded-2xl border border-pt-border bg-white p-5">
                <h2 className="text-base font-bold text-pt-ink">{section.heading}</h2>
                {section.paragraphs?.map((p) => (
                  <p key={p} className="mt-2 text-sm leading-relaxed text-pt-muted">
                    {p}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-pt-muted marker:text-pt-primary">
                    {section.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>

          <p className="flex items-center gap-2 rounded-xl bg-pt-mint-soft p-3 text-xs leading-[1.4] text-pt-muted">
            <Info size={18} className="shrink-0 text-pt-primary" />
            {t("pt.learn.note")}
          </p>
        </>
      )}
    </div>
  );
}
