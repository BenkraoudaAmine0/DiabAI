"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, FileDown, FilePen, ShieldAlert, ShieldCheck, ShieldX, SlidersHorizontal, UserRound, type LucideIcon } from "lucide-react";

import { actionLabel } from "@/components/admin/labels";
import { Btn, FilterSelect, PageHeading, Panel, SearchInput, StateBox, card, useAdminApi } from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { downloadFile } from "@/lib/api";
import { type AuditCategory, type AuditEvent, type AuditResponse, type Integrity, auditTargetHref, clockTime } from "@/lib/admin";

type Period = "today" | "7d" | "30d" | "all";
const CATEGORIES: AuditCategory[] = ["views", "clinical", "admin", "security"];
const CAT_ICON: Record<AuditCategory, LucideIcon> = { views: Eye, clinical: FilePen, admin: SlidersHorizontal, security: ShieldAlert };
const CAT_TONE: Record<AuditCategory, string> = {
  views: "bg-adm-tint text-adm-teal",
  clinical: "bg-adm-green-bg text-adm-green",
  admin: "bg-adm-blue-bg text-adm-blue",
  security: "bg-adm-red-bg text-adm-red",
};

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/** Figma 05 Admin Screens · Audit log (109:30872). */
export default function AdminAuditPage() {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<Period>("7d");
  const [category, setCategory] = useState<"all" | AuditCategory>("all");
  const [actor, setActor] = useState("all");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams({ period });
  if (category !== "all") params.set("category", category);
  if (actor !== "all") params.set("actor", actor);
  const query = params.toString();
  const { data, error, loading, reload } = useAdminApi<AuditResponse>(`/api/admin/audit?${query}`);
  const integrity = useAdminApi<Integrity>("/api/admin/audit/integrity");

  const events = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.events ?? []).filter(
      (e) => !needle || `${e.actor_name} ${actionLabel(t, e.action)} ${e.action} ${e.target_label ?? ""}`.toLowerCase().includes(needle)
    );
  }, [data, q, t]);

  // group by day, newest first
  const days = useMemo(() => {
    const groups: { key: string; first: string; items: AuditEvent[] }[] = [];
    for (const e of events) {
      const key = dayKey(e.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, first: e.created_at, items: [e] });
    }
    return groups;
  }, [events]);

  const today = dayKey(new Date().toISOString());
  const dayTitle = (iso: string) => {
    const date = new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
    return dayKey(iso) === today ? `${t("adm.audit.today")} · ${date}` : date;
  };

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile(`/api/admin/audit/export?${query}`, "diabai-audit.csv");
    } finally {
      setExporting(false);
    }
  }

  const ig = integrity.data;
  return (
    <>
      <PageHeading
        title={t("adm.audit.title")}
        subtitle={t("adm.audit.subtitle")}
        onRefresh={() => {
          reload();
          integrity.reload();
        }}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("adm.audit.search")} />
        <FilterSelect
          label={t("adm.audit.date")}
          value={period}
          onChange={setPeriod}
          options={(["today", "7d", "30d", "all"] as Period[]).map((v) => ({ value: v, label: t(`adm.period.${v}`) }))}
        />
        <FilterSelect
          label={t("adm.audit.action")}
          value={category}
          onChange={setCategory}
          options={[{ value: "all", label: t("adm.audit.allActions") }, ...CATEGORIES.map((c) => ({ value: c, label: t(`adm.audit.cat.${c}`) }))]}
        />
        <FilterSelect
          label={t("adm.audit.user")}
          value={actor}
          onChange={setActor}
          options={[{ value: "all", label: t("adm.audit.allUsers") }, ...(data?.actors ?? []).map((a) => ({ value: a.id, label: a.name }))]}
        />
        <div className="flex-1" />
        <Btn icon={FileDown} onClick={exportCsv} disabled={exporting}>
          {t("adm.exportCsv")}
        </Btn>
      </div>

      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && (
        <div className="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className={`flex min-w-0 flex-col gap-5 p-[18px] ${card}`}>
            {days.length === 0 && <StateBox kind="empty" />}
            {days.map((d) => (
              <div key={d.key} className="flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold text-adm-ink">{dayTitle(d.first)}</h2>
                  {d.key === today && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-adm-green-bg px-2.5 py-1 text-[11px] font-semibold text-adm-green">
                      <span className="size-1.5 rounded-full bg-adm-green" aria-hidden />
                      {t("adm.audit.live")}
                    </span>
                  )}
                </div>
                {d.items.map((e, i) => {
                  const IconCmp = CAT_ICON[e.category];
                  return (
                    <div key={e.id} className="relative flex gap-3 pb-1">
                      {i < d.items.length - 1 && <span className="absolute bottom-0 left-[14px] top-8 w-px bg-adm-border" aria-hidden />}
                      <span className={`z-10 mt-1 flex size-[29px] shrink-0 items-center justify-center rounded-full ${CAT_TONE[e.category]}`}>
                        <IconCmp size={14} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1 border-b border-adm-border py-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13px] text-adm-muted">
                            <span className="font-semibold text-adm-ink">{e.actor_name}</span> {actionLabel(t, e.action)}
                          </p>
                          <span className="shrink-0 font-mono text-[11px] text-adm-muted">{clockTime(e.created_at, lang)}</span>
                        </div>
                        <p className="flex flex-wrap items-center gap-1 text-[11px] text-adm-muted">
                          <UserRound size={12} />
                          {e.target_label ? (
                            auditTargetHref(e) ? (
                              <Link href={auditTargetHref(e)!} className="font-semibold text-adm-blue hover:underline">
                                {e.target_label}
                              </Link>
                            ) : (
                              <span>{e.target_label}</span>
                            )
                          ) : (
                            "—"
                          )}
                          {e.actor_role ? ` · ${t(`role.${e.actor_role}`)}` : ""}
                          {` · #${e.id}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {data.total >= 300 && <p className="text-[11px] text-adm-muted">{t("adm.audit.capped")}</p>}
          </section>

          <div className="flex flex-col gap-[14px]">
            <Panel title={t("adm.audit.integrity")}>
              {integrity.error ? (
                <StateBox kind="error" message={integrity.error} onRetry={integrity.reload} />
              ) : !ig ? (
                <StateBox kind="loading" />
              ) : ig.broken === 0 ? (
                <div className="flex items-center gap-3 rounded-[10px] bg-adm-green-bg p-3">
                  <ShieldCheck size={22} className="shrink-0 text-adm-green" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-semibold text-adm-green">{t("adm.audit.chainOk")}</p>
                    <p className="text-[11px] text-adm-muted">{t("adm.audit.chainCount", { n: ig.total })}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-[10px] bg-adm-red-bg p-3">
                  <ShieldX size={22} className="shrink-0 text-adm-red" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-semibold text-adm-red">{t("adm.audit.chainBroken", { n: ig.broken })}</p>
                    <p className="text-[11px] text-adm-muted">{t("adm.audit.chainFirst", { id: ig.first_broken ?? "—" })}</p>
                  </div>
                </div>
              )}
              {ig?.last_hash && (
                <p className="font-mono text-[11px] text-adm-muted">
                  {t("adm.audit.lastHash")} · {ig.last_hash.slice(0, 4)}…{ig.last_hash.slice(-4)}
                </p>
              )}
            </Panel>

            <Panel title={t("adm.audit.summary")} aside={t("adm.period.today")}>
              {CATEGORIES.map((c) => {
                const IconCmp = CAT_ICON[c];
                return (
                  <div key={c} className="flex items-center gap-3 py-1">
                    <span className={`flex size-7 items-center justify-center rounded-lg ${CAT_TONE[c]}`}>
                      <IconCmp size={14} />
                    </span>
                    <span className="flex-1 text-[13px] text-adm-muted">{t(`adm.audit.cat.${c}`)}</span>
                    <span className="text-[13px] font-bold text-adm-ink">{data.today[c] ?? 0}</span>
                  </div>
                );
              })}
            </Panel>

            <Panel title={t("adm.audit.retention")}>
              <p className="text-2xl font-bold text-adm-ink">{t("adm.audit.retentionValue")}</p>
              <p className="text-[11px] leading-relaxed text-adm-muted">{t("adm.audit.retentionText")}</p>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
