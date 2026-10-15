"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock3, Download, LockKeyhole, ShieldCheck, UserCheck, UserPlus, Users } from "lucide-react";

import InviteDialog from "@/components/admin/InviteDialog";
import { ACCOUNT_TONE } from "@/components/admin/labels";
import {
  Btn,
  DataTable,
  FilterSelect,
  Notice,
  PageHeading,
  Pagination,
  Panel,
  SearchInput,
  StateBox,
  StatusPill,
  SummaryCard,
  cellCls,
  rowCls,
  useAdminApi,
  usePaged,
} from "@/components/admin/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { type AccountStatus, type DeletionRequestRow, type UsersResponse, downloadCsv, shortDate, timeAgo } from "@/lib/admin";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["patient", "doctor", "admin"];

function DeletionRequests({ onChange }: { onChange: () => void }) {
  const { t, lang } = useI18n();
  const { data, error, reload } = useAdminApi<{ requests: DeletionRequestRow[] }>("/api/admin/deletion-requests");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pending = (data?.requests ?? []).filter((r) => r.status === "pending");

  async function decide(r: DeletionRequestRow, decision: "approve" | "reject") {
    if (decision === "approve" && !window.confirm(t("adm.del.confirm", { email: r.user?.email ?? r.user_id }))) return;
    try {
      await api(`/api/admin/deletion-requests/${r.id}`, { method: "POST", body: JSON.stringify({ decision }) });
      setMsg({ ok: true, text: t(decision === "approve" ? "adm.del.approved" : "adm.del.rejected") });
      reload();
      onChange(); // the deleted account leaves the user table too
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  return (
    <Panel title={t("adm.del.title")} aside={t("adm.del.pending", { n: pending.length })}>
      <p className="text-[11px] text-adm-muted">{t("adm.del.desc")}</p>
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {data && pending.length === 0 && <StateBox kind="empty" message={t("adm.del.none")} />}
      {pending.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-adm-border pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-xs font-semibold text-adm-ink">
              {r.user?.full_name ?? "—"} <span className="font-normal text-adm-muted">· {r.user?.email} · {r.user ? t(`role.${r.user.role}`) : ""}</span>
            </p>
            <p className="text-[11px] text-adm-muted">
              {timeAgo(r.created_at, lang)}
              {r.reason ? ` — « ${r.reason} »` : ""}
            </p>
          </div>
          <Btn onClick={() => decide(r, "reject")}>{t("adm.del.reject")}</Btn>
          <Btn variant="danger" onClick={() => decide(r, "approve")}>
            {t("adm.del.approve")}
          </Btn>
        </div>
      ))}
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
    </Panel>
  );
}

/** Figma 05 Admin Screens · User management (109:30213). */
function AdminUsersPageContent() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const { data, error, loading, reload } = useAdminApi<UsersResponse>("/api/admin/users");
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? ""); // ?q= from the audit log / alerts
  const [role, setRole] = useState<"all" | Role>("all");
  const [status, setStatus] = useState<"all" | AccountStatus>("all");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.users ?? []).filter(
      (u) =>
        (role === "all" || u.role === role) &&
        (status === "all" || u.status === status) &&
        (!needle || `${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(needle))
    );
  }, [data, q, role, status]);
  const { slice, page, pages, setPage, total } = usePaged(rows, `${q}|${role}|${status}`);

  async function act(path: string, body: object, ok: string) {
    setMsg(null);
    try {
      await api(path, { method: "PUT", body: JSON.stringify(body) });
      setMsg({ ok: true, text: ok });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  function exportCsv() {
    downloadCsv(
      "diabai-users.csv",
      ["name", "email", "role", "status", "2fa", "last_sign_in", "created"],
      rows.map((u) => [u.full_name, u.email, u.role, u.status, u.has_2fa ? "yes" : "no", u.last_sign_in_at, u.created_at])
    );
  }

  const s = data?.summary;
  return (
    <>
      <PageHeading title={t("adm.users.title")} subtitle={t("adm.users.subtitle")} onRefresh={reload} />
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={Users} value={s.total} label={t("adm.users.total")} />
          <SummaryCard icon={UserCheck} value={s.active} label={t("adm.st.active")} tone="green" />
          <SummaryCard icon={Clock3} value={s.pending} label={t("adm.users.pending")} tone="amber" />
          <SummaryCard icon={LockKeyhole} value={s.suspended} label={t("adm.st.suspended")} tone="red" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("adm.users.search")} />
        <FilterSelect
          label={t("adm.users.colRole")}
          value={role}
          onChange={setRole}
          options={[{ value: "all", label: t("adm.users.allRoles") }, ...ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))]}
        />
        <FilterSelect
          label={t("adm.users.colStatus")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: t("adm.users.anyStatus") },
            ...(["active", "invited", "pending", "suspended"] as AccountStatus[]).map((v) => ({ value: v, label: t(`adm.st.${v}`) })),
          ]}
        />
        <div className="flex-1" />
        <Btn icon={Download} onClick={exportCsv} disabled={!rows.length}>
          {t("adm.export")}
        </Btn>
        <Btn icon={UserPlus} variant="primary" onClick={() => setInviting(true)}>
          {t("adm.users.add")}
        </Btn>
      </div>

      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      {data && !data.auth_available && <Notice ok={false}>{t("adm.users.noAuth")}</Notice>}
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && (
        <DataTable
          head={[
            t("adm.users.colName"),
            t("adm.users.colEmail"),
            t("adm.users.colRole"),
            t("adm.users.colStatus"),
            "2FA",
            t("adm.users.colLast"),
            t("adm.users.colCreated"),
            "",
          ]}
          footer={<Pagination page={page} pages={pages} total={total} setPage={setPage} />}
        >
          {slice.map((u) => {
            const self = u.id === profile?.id;
            return (
              <tr key={u.id} className={rowCls}>
                <td className={`${cellCls} max-w-[180px] truncate font-semibold text-adm-ink`}>{u.full_name ?? "—"}</td>
                <td className={`${cellCls} max-w-[200px] truncate text-adm-muted`}>{u.email}</td>
                <td className={cellCls}>
                  <select
                    value={u.role}
                    disabled={self}
                    aria-label={t("adm.users.colRole")}
                    title={self ? t("adm.users.selfRole") : undefined}
                    onChange={(e) => {
                      const next = e.target.value as Role;
                      if (window.confirm(t("adm.users.confirmRole", { name: u.full_name ?? u.email ?? "", role: t(`role.${next}`) })))
                        act(`/api/admin/users/${u.id}/role`, { role: next }, t("adm.users.roleChanged"));
                    }}
                    className="rounded-md border border-transparent bg-transparent py-1 text-xs text-adm-muted hover:border-adm-border disabled:opacity-70"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role.${r}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cellCls}>{u.status ? <StatusPill tone={ACCOUNT_TONE[u.status]}>{t(`adm.st.${u.status}`)}</StatusPill> : "—"}</td>
                <td className={cellCls}>{u.has_2fa ? <ShieldCheck size={15} className="text-adm-green" aria-label="2FA" /> : <span className="text-adm-muted">—</span>}</td>
                <td className={`${cellCls} text-adm-muted`}>{timeAgo(u.last_sign_in_at, lang)}</td>
                <td className={`${cellCls} text-adm-muted`}>{shortDate(u.created_at, lang)}</td>
                <td className={`${cellCls} text-right`}>
                  {!self && u.status && (
                    <button
                      type="button"
                      onClick={() => {
                        const suspend = u.status !== "suspended";
                        if (suspend && !window.confirm(t("adm.users.confirmSuspend", { name: u.full_name ?? u.email ?? "" }))) return;
                        act(`/api/admin/users/${u.id}/status`, { active: !suspend }, t(suspend ? "adm.users.suspended" : "adm.users.reactivated"));
                      }}
                      className={`text-xs font-semibold ${u.status === "suspended" ? "text-adm-teal" : "text-adm-red"} hover:underline`}
                    >
                      {t(u.status === "suspended" ? "adm.users.reactivate" : "adm.users.suspend")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {slice.length === 0 && (
            <tr>
              <td colSpan={8} className="p-3">
                <StateBox kind="empty" />
              </td>
            </tr>
          )}
        </DataTable>
      )}

      <DeletionRequests onChange={reload} />

      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onDone={(email) => {
            setInviting(false);
            setMsg({ ok: true, text: t("adm.users.invited", { email }) });
            reload();
          }}
        />
      )}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}
