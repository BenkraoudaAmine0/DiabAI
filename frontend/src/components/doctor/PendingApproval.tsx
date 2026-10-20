"use client";

import Link from "next/link";
import { Clock, Eye, FileText, Footprints, MessageSquare, Settings, UsersRound, type LucideIcon } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

const FEATURES: [LucideIcon, string][] = [
  [UsersRound, "dr.pending.f.patients"],
  [FileText, "dr.pending.f.risk"],
  [Eye, "dr.pending.f.retina"],
  [Footprints, "dr.pending.f.foot"],
  [MessageSquare, "dr.pending.f.chat"],
];

/** What a doctor sees on a clinical page while an admin has not approved
 *  the account yet: why, the details the admin checks, what unlocks. */
export default function PendingApproval() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const details: [string, string | null | undefined][] = [
    [t("dr.pending.license"), profile?.license_number],
    [t("dr.pending.facility"), profile?.facility],
    [t("dr.pending.email"), profile?.email],
  ];
  const card = "flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-6 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#fef3c7] text-status-prediabetes">
          <Clock size={32} strokeWidth={1.8} />
        </span>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("dr.pending.title")}</h1>
        <p className="max-w-xl text-sm leading-[1.6] text-slate-600">{t("dr.pending.text")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        <div className={card}>
          <p className="text-[15px] font-bold text-slate-900">{t("dr.pending.details")}</p>
          <dl className="flex flex-col">
            {details.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-right text-sm font-semibold text-slate-900">{value || t("dr.pending.missing")}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/doctor/settings"
            className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Settings size={15} />
            {t("dr.pending.edit")}
          </Link>
        </div>

        <div className={card}>
          <p className="text-[15px] font-bold text-slate-900">{t("dr.pending.unlock")}</p>
          <ul className="flex flex-col gap-3">
            {FEATURES.map(([IconCmp, key]) => (
              <li key={key} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pt-mint text-brand">
                  <IconCmp size={16} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        {t("dr.pending.meanwhile")}{" "}
        <Link href="/doctor/help" className="font-semibold text-brand hover:underline">
          {t("dr.nav.help")}
        </Link>
      </p>
    </div>
  );
}
