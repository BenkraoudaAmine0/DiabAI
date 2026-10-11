"use client";

import Link from "next/link";
import {
  Bell,
  BookOpen,
  ChevronRight,
  FileHeart,
  Footprints,
  HeartPulse,
  Mail,
  MessageCircle,
  Phone,
  ScanFace,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import ClinicalBadge from "@/components/ClinicalBadge";
import VitalsTiles from "@/components/patient/VitalsTiles";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { usePatientSummary } from "@/hooks/usePatientSummary";
import { useI18n } from "@/i18n";
import { firstName, greetingKey, notificationTitle, notificationWhen, shortDate } from "@/lib/patient";

const card = "flex flex-col gap-4 overflow-hidden rounded-2xl border border-pt-border bg-white p-5";

function CardTitle({ icon: IconCmp, title, aside }: { icon: LucideIcon; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
          <IconCmp size={18} strokeWidth={1.75} />
        </span>
        <span className="text-base font-bold text-pt-ink">{title}</span>
      </span>
      {aside}
    </div>
  );
}

/** Figma "Education card": 40px mint tile · tag / title / text · chevron. */
function EducationCard({ href, icon: IconCmp, tag, title, text }: { href: string; icon: LucideIcon; tag?: string; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-pt-border bg-white p-3 transition-colors hover:border-pt-primary/40"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-primary">
        <IconCmp size={20} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {tag && <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-pt-primary">{tag}</span>}
        <span className="text-[15px] font-bold text-pt-ink">{title}</span>
        <span className="text-xs leading-[1.35] text-pt-muted">{text}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-pt-primary" />
    </Link>
  );
}

const ACTIONS: { href: string; icon: LucideIcon; key: string }[] = [
  { href: "/patient/history", icon: FileHeart, key: "results" },
  { href: "/patient/foot", icon: Footprints, key: "foot" },
  { href: "/patient/neck", icon: ScanFace, key: "neck" },
  { href: "/chat", icon: MessageCircle, key: "chat" },
];

/** Patient home: health summary, latest confirmed result and measurements,
 *  quick actions, care team, latest notifications and education. */
export default function PatientHome() {
  const { profile, session } = useAuth();
  const { t, lang } = useI18n();
  const { summary } = usePatientSummary();
  const { notifications, loaded } = useNotifications(session?.user.id);

  const lastCheck = shortDate(summary?.last_check_at, lang);
  const nextVisit = shortDate(summary?.next_visit_at ?? profile?.next_visit_at, lang);
  const result = summary?.latest_result;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold leading-[1.15] text-pt-ink">{t(greetingKey(), { name: firstName(profile?.full_name) })}</h1>
        <p className="text-[13px] text-pt-muted">{t("pt.home.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* My health — opens the results the doctor confirmed */}
            <Link
              href="/patient/history"
              className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-pt-deep p-5 shadow-[0_4px_14px_rgba(23,51,47,0.07)] transition-opacity hover:opacity-95"
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <HeartPulse size={20} className="text-white" strokeWidth={1.75} />
                  <span className="text-xl font-bold text-white">{t("pt.home.myHealth")}</span>
                </span>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white">{t("pt.home.private")}</span>
              </span>
              <span className="flex gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl bg-white/[0.07] p-3">
                  <span className="text-xs text-white/72">{t("pt.home.lastCheck")}</span>
                  <span className="text-[15px] font-bold text-white">{lastCheck ?? t("pt.home.none")}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl bg-white/[0.07] p-3">
                  <span className="text-xs text-white/72">{t("pt.home.nextVisit")}</span>
                  <span className="text-[15px] font-bold text-white">{nextVisit ?? t("pt.home.notScheduled")}</span>
                </span>
              </span>
            </Link>

            {/* latest result the doctor confirmed */}
            <div className={card}>
              <CardTitle icon={FileHeart} title={t("pt.home.latestResult")} />
              {result ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <ClinicalBadge status={result.status} withIcon />
                    <span className="text-xs text-pt-muted">{shortDate(result.created_at, lang)}</span>
                  </div>
                  <Link href={`/predictions/${result.id}`} className="flex items-center gap-1 text-sm font-semibold text-pt-primary hover:underline">
                    {t("pt.home.openReport")}
                    <ChevronRight size={16} />
                  </Link>
                </>
              ) : (
                <p className="text-sm text-pt-muted">{t("pt.home.noResult")}</p>
              )}
            </div>
          </div>

          <div className={card}>
            <CardTitle
              icon={Stethoscope}
              title={t("pt.home.measures")}
              aside={
                <Link href="/patient/history" className="text-xs font-semibold text-pt-primary hover:underline">
                  {t("pt.home.seeAll")}
                </Link>
              }
            />
            <VitalsTiles vitals={summary?.latest_vitals} compact />
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-pt-ink">{t("pt.home.quick")}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ACTIONS.map(({ href, icon: IconCmp, key }) => (
                <Link
                  key={key}
                  href={href}
                  className="flex flex-col gap-3 rounded-2xl border border-pt-border bg-white p-4 transition-colors hover:border-pt-primary/40"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-pt-mint text-pt-primary">
                    <IconCmp size={20} strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-bold text-pt-ink">{t(`pt.home.act.${key}`)}</span>
                  <span className="text-xs leading-[1.35] text-pt-muted">{t(`pt.home.act.${key}Desc`)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className={card}>
            <CardTitle icon={Stethoscope} title={t("pt.home.careTeam")} />
            {summary && summary.doctors.length === 0 && <p className="text-sm text-pt-muted">{t("pt.home.noCareTeam")}</p>}
            {summary?.doctors.map((d) => (
              <div key={d.id} className="flex flex-col gap-1.5 rounded-xl bg-pt-mint-soft p-3">
                <p className="text-sm font-bold text-pt-ink">Dr. {d.full_name ?? "—"}</p>
                {d.email && (
                  <a href={`mailto:${d.email}`} className="flex items-center gap-2 text-xs text-pt-primary hover:underline">
                    <Mail size={14} /> {d.email}
                  </a>
                )}
                {d.phone && (
                  <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-xs text-pt-primary hover:underline">
                    <Phone size={14} /> {d.phone}
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className={card}>
            <CardTitle
              icon={Bell}
              title={t("pt.home.notifications")}
              aside={
                <Link href="/patient/notifications" className="text-xs font-semibold text-pt-primary hover:underline">
                  {t("pt.home.seeAll")}
                </Link>
              }
            />
            {loaded && notifications.length === 0 && <p className="text-sm text-pt-muted">{t("pt.home.noNotifications")}</p>}
            {notifications.slice(0, 3).map((n) => (
              <Link key={n.id} href={n.link || "/patient/notifications"} className="flex items-start gap-2.5 rounded-xl p-2 hover:bg-pt-mint-soft">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-pt-border" : "bg-pt-primary"}`} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-pt-ink">{notificationTitle(t, n.kind)}</span>
                  <span className="text-xs text-pt-muted">{notificationWhen(n.created_at, lang, t("pt.notif.yesterday"))}</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-pt-ink">{t("pt.home.forYou")}</p>
            <EducationCard
              href="/patient/learn/diabetes-basics"
              icon={BookOpen}
              tag={t("pt.home.readTime", { n: 5 })}
              title={t("pt.home.learnBasics")}
              text={t("pt.home.learnBasicsDesc")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
