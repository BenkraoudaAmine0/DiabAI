"use client";

import { useEffect, useState } from "react";

import KnowledgeBasePanel from "@/components/KnowledgeBasePanel";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { formatDateTime as fmt, humanSize } from "@/lib/format";
import type { AdminStats, AdminUser, Role } from "@/lib/types";

const ROLE_BADGE: Record<string, string> = {
  doctor: "bg-teal-100 text-teal-700",
  patient: "bg-slate-200 text-slate-600",
  admin: "bg-amber-100 text-amber-700",
};

export default function AdminDashboard() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<"all" | Role>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminStats>("/api/admin/stats")
      .then(setStats)
      .catch((e) =>
        setError(e instanceof Error ? e.message : t("common.error"))
      );
    api<{ users: AdminUser[] }>("/api/admin/users")
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]));
  }, [t]);

  const shown = users.filter((u) => filter === "all" || u.role === filter);
  const g = stats?.gemini;

  const cards = stats
    ? [
        { label: t("admin.doctors"), value: String(stats.counts.doctors), icon: "🩺" },
        { label: t("admin.patients"), value: String(stats.counts.patients), icon: "👥" },
        { label: t("admin.geminiCalls"), value: String(g?.totals.calls ?? 0), icon: "⚡" },
        {
          label: t("admin.estimatedCost"),
          value: `$${(g?.totals.estimated_cost_usd ?? 0).toFixed(4)}`,
          icon: "💲",
        },
      ]
    : [];

  const usageRows = g
    ? [
        { label: t("admin.totals"), u: g.totals },
        { label: t("admin.generate"), u: g.generate },
        { label: t("admin.embedding"), u: g.embedding },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.subtitle")}</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {/* stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span className="text-2xl" aria-hidden>
              {c.icon}
            </span>
            <p className="mt-2 text-3xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* storage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">{t("admin.storage")}</h2>
          <ul className="mt-3 space-y-2">
            {stats &&
              Object.entries(stats.storage).map(([bucket, u]) => (
                <li
                  key={bucket}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-700">{bucket}</span>
                  <span className="text-slate-500">
                    {humanSize(u.bytes)} · {u.objects} {t("admin.objects")}
                  </span>
                </li>
              ))}
          </ul>
        </div>

        {/* gemini usage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            Gemini — {t("admin.estimatedCost")}
          </h2>
          {g && g.totals.calls === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("admin.noUsage")}</p>
          ) : (
            <>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 font-semibold">—</th>
                    <th className="pb-2 text-right font-semibold">
                      {t("admin.inputTokens")}
                    </th>
                    <th className="pb-2 text-right font-semibold">
                      {t("admin.outputTokens")}
                    </th>
                    <th className="pb-2 text-right font-semibold">$</th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map(({ label, u }) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-700">{label}</td>
                      <td className="py-2 text-right text-slate-600">
                        {u.input_tokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {u.output_tokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-semibold text-slate-800">
                        ${u.estimated_cost_usd.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {g?.last_call && (
                <p className="mt-2 text-xs text-slate-400">
                  {t("admin.lastCall")}: {fmt(g.last_call, lang)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* knowledge base: upload documents & books for the chatbot */}
      <KnowledgeBasePanel />

      {/* users */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">{t("admin.users")}</h2>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "doctor", "patient", "admin"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilter(r)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                  filter === r ? "bg-white text-teal-700 shadow-sm" : "text-slate-500"
                }`}
              >
                {r === "all" ? t("admin.all") : t(`role.${r}`)}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("history.empty")}</p>
        ) : (
          <div className="scroll-slim mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 font-semibold">{t("common.fullName")}</th>
                  <th className="pb-2 font-semibold">{t("common.email")}</th>
                  <th className="pb-2 font-semibold">{t("profile.role")}</th>
                  <th className="pb-2 text-right font-semibold">
                    {t("admin.predMade")} / {t("admin.predReceived")}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {t("admin.scansPerf")} / {t("admin.scansRecv")}
                  </th>
                  <th className="pb-2 text-right font-semibold">
                    {t("profile.account")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="py-2.5 font-medium text-slate-800">
                      {u.full_name ?? "—"}
                    </td>
                    <td className="py-2.5 text-slate-500">{u.email}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ROLE_BADGE[u.role] ?? "bg-slate-100"
                        }`}
                      >
                        {t(`role.${u.role}`)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {u.counts.predictions_made} / {u.counts.predictions_received}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {u.counts.scans_performed} / {u.counts.scans_received}
                    </td>
                    <td className="py-2.5 text-right text-xs text-slate-400">
                      {fmt(u.created_at, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
