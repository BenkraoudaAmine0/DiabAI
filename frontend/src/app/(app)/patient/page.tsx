"use client";

import Link from "next/link";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

export default function PatientHome() {
  const { profile } = useAuth();
  const { t } = useI18n();

  const tiles = [
    {
      href: "/patient/foot",
      icon: "🦶",
      title: t("scan.foot.title"),
      desc: t("scan.foot.desc"),
    },
    {
      href: "/patient/neck",
      icon: "🧣",
      title: t("scan.neck.title"),
      desc: t("scan.neck.desc"),
    },
    {
      href: "/patient/history",
      icon: "📋",
      title: t("history.title"),
      desc: t("history.subtitle"),
    },
    {
      href: "/chat",
      icon: "💬",
      title: t("chat.title"),
      desc: t("chat.subtitle"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("nav.home")}, {profile?.full_name} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("app.tagline")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="text-3xl" aria-hidden>
              {tile.icon}
            </span>
            <h2 className="mt-3 font-semibold text-slate-900">{tile.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{tile.desc}</p>
          </Link>
        ))}
      </div>

      <p className="rounded-2xl bg-teal-50 px-5 py-4 text-sm text-teal-700">
        ℹ️ {t("chat.disclaimer")}
      </p>
    </div>
  );
}
