"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck, ClipboardClock, HeartPulse, LockKeyhole, TriangleAlert } from "lucide-react";

import { DIRECTORY_TONE } from "@/components/admin/labels";
import {
  DataTable,
  FilterSelect,
  PageHeading,
  Pagination,
  SearchInput,
  StateBox,
  StatusPill,
  SummaryCard,
  cellCls,
  rowCls,
  useAdminApi,
  usePaged,
} from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { type DirectoryStatus, type PatientsResponse, shortDate } from "@/lib/admin";
import { shortId } from "@/lib/clinical";

const STATUSES: DirectoryStatus[] = ["stable", "needs_review", "new", "high_risk"];

/** Figma 05 Admin Screens · Patients (109:30645). Names are shortened
 *  ("Meriem A.") and no contact detail is sent: the directory is for
 *  oversight, records stay with the care team. */
function AdminPatientsPageContent() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useAdminApi<PatientsResponse>("/api/admin/patients");
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? ""); // ?q= from the audit log / alerts
  const [status, setStatus] = useState<"all" | DirectoryStatus>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.patients ?? []).filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (!needle || `${p.name} pt-${shortId(p.id)}`.toLowerCase().includes(needle))
    );
  }, [data, q, status]);
  const { slice, page, pages, setPage, total } = usePaged(rows, `${q}|${status}`);

  const s = data?.summary;
  return (
    <>
      <PageHeading title={t("adm.pat.title")} subtitle={t("adm.pat.subtitle")} onRefresh={reload} />
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={HeartPulse} value={s.total} label={t("adm.pat.total")} />
          <SummaryCard icon={CircleCheck} value={s.stable} label={t("adm.pat.st.stable")} tone="green" />
          <SummaryCard icon={ClipboardClock} value={s.needs_review} label={t("adm.pat.st.needs_review")} tone="amber" />
          <SummaryCard icon={TriangleAlert} value={s.high_risk} label={t("adm.pat.st.high_risk")} tone="red" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("adm.pat.search")} />
        <FilterSelect
          label={t("adm.users.colStatus")}
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: t("adm.pat.allStatuses") }, ...STATUSES.map((v) => ({ value: v, label: t(`adm.pat.st.${v}`) }))]}
        />
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-adm-green" title={t("adm.pat.minimisedHint")}>
          <LockKeyhole size={14} />
          {t("adm.pat.minimised")}
        </span>
      </div>

      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && (
        <DataTable
          head={[t("adm.pat.colId"), t("adm.users.colName"), t("adm.pat.colCondition"), t("adm.pat.colCare"), t("adm.users.colStatus"), t("adm.users.colCreated")]}
          footer={<Pagination page={page} pages={pages} total={total} setPage={setPage} />}
        >
          {slice.map((p) => (
            <tr key={p.id} className={rowCls}>
              <td className={`${cellCls} font-mono font-semibold text-adm-ink`}>PT-{shortId(p.id)}</td>
              <td className={`${cellCls} text-adm-muted`}>{p.name}</td>
              <td className={`${cellCls} text-adm-muted`}>{t(`clinical.${p.condition}`)}</td>
              <td className={`${cellCls} text-adm-muted`}>
                {p.care_team ?? "—"}
                {p.care_team_size > 1 ? ` +${p.care_team_size - 1}` : ""}
              </td>
              <td className={cellCls}>
                <StatusPill tone={DIRECTORY_TONE[p.status]}>{t(`adm.pat.st.${p.status}`)}</StatusPill>
              </td>
              <td className={`${cellCls} text-adm-muted`}>{shortDate(p.created_at, lang)}</td>
            </tr>
          ))}
          {slice.length === 0 && (
            <tr>
              <td colSpan={6} className="p-3">
                <StateBox kind="empty" />
              </td>
            </tr>
          )}
        </DataTable>
      )}
    </>
  );
}

export default function AdminPatientsPage() {
  return (
    <Suspense fallback={null}>
      <AdminPatientsPageContent />
    </Suspense>
  );
}
