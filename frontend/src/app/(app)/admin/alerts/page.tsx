"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, CircleAlert, Ellipsis, SearchCheck, ShieldAlert, Timer } from "lucide-react";

import { ALERT_STATUS_TONE, LEVEL_TONE } from "@/components/admin/labels";
import {
  Btn,
  FilterSelect,
  Notice,
  PageHeading,
  SearchInput,
  StateBox,
  StatusPill,
  SummaryCard,
  TONES,
  card,
  useAdminApi,
} from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { type AlertLevel, type AlertRow, type AlertStatus, type AlertsResponse, timeAgo } from "@/lib/admin";

type StatusFilter = "unresolved" | AlertStatus | "all";
type Period = "today" | "7d" | "30d" | "all";
const LEVELS: AlertLevel[] = ["critical", "high", "medium", "low"];

function RowMenu({ alert, onSet }: { alert: AlertRow; onSet: (s: AlertStatus) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const choices = (["investigating", "resolved", "open"] as AlertStatus[]).filter((s) => s !== alert.status);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-label={t("adm.al.actions")}
        className="flex size-[30px] items-center justify-center rounded-lg bg-adm-soft text-adm-muted hover:text-adm-ink"
      >
        <Ellipsis size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-[10px] border border-adm-border bg-white py-1 shadow-lg">
          {choices.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSet(s);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-adm-ink hover:bg-adm-soft"
            >
              {t(`adm.al.to.${s}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Figma 05 Admin Screens · Error alerts (109:31584). Alerts are opened by
 *  the API itself (5xx answers, crashes, failed uploads); repeats of the
 *  same open error are counted on one alert. */
export default function AdminAlertsPage() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<StatusFilter>("unresolved");
  const [level, setLevel] = useState<"all" | AlertLevel>("all");
  const [period, setPeriod] = useState<Period>("7d");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const params = new URLSearchParams({ status, period });
  if (level !== "all") params.set("level", level);
  const { data, error, loading, reload } = useAdminApi<AlertsResponse>(`/api/admin/alerts?${params.toString()}`);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [lastData, setLastData] = useState(data);
  if (data !== lastData) {
    setLastData(data);
    setLoadedAt(new Date().toISOString());
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.alerts ?? []).filter((a) => !needle || `${a.source} ${a.message}`.toLowerCase().includes(needle));
  }, [data, q]);
  const openIds = rows.filter((a) => a.status !== "resolved").map((a) => a.id);

  async function setAlert(id: number, next: AlertStatus) {
    setMsg(null);
    try {
      await api(`/api/admin/alerts/${id}`, { method: "PUT", body: JSON.stringify({ status: next }) });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  async function markReviewed() {
    if (!openIds.length || !window.confirm(t("adm.al.confirmReview", { n: openIds.length }))) return;
    try {
      const r = await api<{ resolved: number }>("/api/admin/alerts/review", { method: "POST", body: JSON.stringify({ ids: openIds.slice(0, 500) }) });
      setMsg({ ok: true, text: t("adm.al.reviewed", { n: r.resolved }) });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  const s = data?.summary;
  return (
    <>
      <PageHeading title={t("adm.al.title")} subtitle={t("adm.al.subtitle")} onRefresh={reload} />
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={CircleAlert} value={s.unresolved} label={t("adm.al.unresolved")} tone="red" />
          <SummaryCard icon={ShieldAlert} value={s.critical} label={t("adm.al.lv.critical")} tone="red" />
          <SummaryCard icon={SearchCheck} value={s.investigating} label={t("adm.al.st.investigating")} tone="amber" />
          <SummaryCard icon={Timer} value={s.mean_response_min == null ? "—" : `${s.mean_response_min} min`} label={t("adm.al.meanResponse")} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("adm.al.search")} />
        <FilterSelect
          label={t("adm.al.severity")}
          value={level}
          onChange={setLevel}
          options={[{ value: "all", label: t("adm.al.allLevels") }, ...LEVELS.map((v) => ({ value: v, label: t(`adm.al.lv.${v}`) }))]}
        />
        <FilterSelect
          label={t("adm.users.colStatus")}
          value={status}
          onChange={setStatus}
          options={(["unresolved", "open", "investigating", "resolved", "all"] as StatusFilter[]).map((v) => ({
            value: v,
            label: v === "all" ? t("adm.pat.allStatuses") : v === "unresolved" ? t("adm.al.unresolved") : t(`adm.al.st.${v}`),
          }))}
        />
        <FilterSelect
          label={t("adm.al.period")}
          value={period}
          onChange={setPeriod}
          options={(["today", "7d", "30d", "all"] as Period[]).map((v) => ({ value: v, label: t(`adm.period.${v}`) }))}
        />
        <div className="flex-1" />
        <Btn icon={CheckCheck} onClick={markReviewed} disabled={!openIds.length}>
          {t("adm.al.markReviewed")}
        </Btn>
      </div>

      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && (
        <section className={`overflow-hidden ${card}`}>
          <div className="flex items-center justify-between border-b border-adm-border bg-adm-soft px-[18px] py-3.5">
            <h2 className="text-base font-bold text-adm-ink">{t("adm.al.latest")}</h2>
            <span className="text-xs text-adm-muted">{t("adm.al.updated", { time: timeAgo(loadedAt, lang) })}</span>
          </div>
          {rows.length === 0 && (
            <div className="p-4">
              <StateBox kind="empty" message={t("adm.al.none")} />
            </div>
          )}
          {rows.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-4 border-b border-adm-border px-[18px] py-4 last:border-b-0">
              <span className={`h-11 w-1 shrink-0 rounded-full ${TONES[LEVEL_TONE[a.level]].bar}`} aria-hidden />
              <span className={`w-16 shrink-0 text-xs font-bold ${TONES[LEVEL_TONE[a.level]].pill.split(" ")[1]}`}>{t(`adm.al.lv.${a.level}`)}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="break-words text-[13px] font-semibold text-adm-ink">{a.message}</p>
                <p className="text-[11px] text-adm-muted">
                  <span className="font-mono">{a.source}</span>
                  {a.detail?.count && a.detail.count > 1 ? ` · ${t("adm.al.times", { n: a.detail.count })}` : ""}
                  {a.detail?.last_seen ? ` · ${t("adm.al.lastSeen", { time: timeAgo(a.detail.last_seen, lang) })}` : ""}
                </p>
              </div>
              <span className="w-24 shrink-0 text-xs text-adm-muted">{timeAgo(a.created_at, lang)}</span>
              <StatusPill tone={ALERT_STATUS_TONE[a.status]}>{t(`adm.al.st.${a.status}`)}</StatusPill>
              <RowMenu alert={a} onSet={(next) => setAlert(a.id, next)} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
