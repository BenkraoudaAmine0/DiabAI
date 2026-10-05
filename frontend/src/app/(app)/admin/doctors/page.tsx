"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Building2, Hourglass, Link2, MailPlus } from "lucide-react";

import InviteDialog from "@/components/admin/InviteDialog";
import {
  Btn,
  DataTable,
  FilterSelect,
  Notice,
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
import { api } from "@/lib/api";
import type { DoctorsResponse } from "@/lib/admin";

/** Figma 05 Admin Screens · Doctors (109:30436). */
export default function AdminDoctorsPage() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useAdminApi<DoctorsResponse>("/api/admin/doctors");
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("all");
  const [state, setState] = useState<"all" | "verified" | "pending">("all");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const specialties = useMemo(
    () => [...new Set((data?.doctors ?? []).map((d) => d.specialty?.trim()).filter((v): v is string => !!v))].sort(),
    [data]
  );
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.doctors ?? []).filter(
      (d) =>
        (specialty === "all" || d.specialty?.trim() === specialty) &&
        (state === "all" || (state === "verified") === d.verified) &&
        (!needle || `${d.full_name ?? ""} ${d.email ?? ""} ${d.license_number ?? ""}`.toLowerCase().includes(needle))
    );
  }, [data, q, specialty, state]);
  const { slice, page, pages, setPage, total } = usePaged(rows, `${q}|${specialty}|${state}`);

  async function verify(id: string, verified: boolean, name: string) {
    if (verified && !window.confirm(t("adm.doc.confirmVerify", { name }))) return;
    setMsg(null);
    try {
      await api(`/api/admin/doctors/${id}/verify`, { method: "PUT", body: JSON.stringify({ verified }) });
      setMsg({ ok: true, text: t(verified ? "adm.doc.verifiedMsg" : "adm.doc.revokedMsg", { name }) });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  const s = data?.summary;
  return (
    <>
      <PageHeading title={t("adm.doc.title")} subtitle={t("adm.doc.subtitle")} onRefresh={reload} />
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard
            icon={BadgeCheck}
            value={t("adm.doc.verified", { n: s.verified })}
            label={t("adm.doc.verifiedSub", { pct: s.total ? Math.round((100 * s.verified) / s.total) : 0 })}
          />
          <SummaryCard icon={Building2} value={t("adm.doc.facilities", { n: s.facilities })} label={t("adm.doc.facilitiesSub")} />
          <SummaryCard icon={Hourglass} value={t("adm.doc.pending", { n: s.pending })} label={t("adm.doc.pendingSub")} tone="amber" />
          <SummaryCard icon={Link2} value={t("adm.doc.links", { n: s.links })} label={t("adm.doc.linksSub", { avg: s.avg_patients })} tone="blue" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("adm.doc.search")} />
        <FilterSelect
          label={t("adm.doc.colSpecialty")}
          value={specialty}
          onChange={setSpecialty}
          options={[{ value: "all", label: t("adm.doc.allSpecialties") }, ...specialties.map((v) => ({ value: v, label: v }))]}
        />
        <FilterSelect
          label={t("adm.users.colStatus")}
          value={state}
          onChange={setState}
          options={[
            { value: "all", label: t("adm.users.anyStatus") },
            { value: "verified", label: t("adm.doc.stVerified") },
            { value: "pending", label: t("adm.doc.stPending") },
          ]}
        />
        <div className="flex-1" />
        <Btn icon={MailPlus} variant="primary" onClick={() => setInviting(true)}>
          {t("adm.doc.invite")}
        </Btn>
      </div>

      <p className="text-[11px] text-adm-muted">{t("adm.doc.verifyNote")}</p>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      {data && !data.verification_available && <Notice ok={false}>{t("adm.migration0012")}</Notice>}
      {error && <StateBox kind="error" message={error} onRetry={reload} />}
      {loading && <StateBox kind="loading" />}

      {data && (
        <DataTable
          head={[
            t("adm.users.colName"),
            t("adm.doc.colLicense"),
            t("adm.doc.colSpecialty"),
            t("adm.doc.colFacility"),
            t("adm.doc.colPatients"),
            t("adm.users.colStatus"),
            "",
          ]}
          footer={<Pagination page={page} pages={pages} total={total} setPage={setPage} />}
        >
          {slice.map((d) => {
            const name = d.full_name ?? d.email ?? "—";
            return (
              <tr key={d.id} className={rowCls}>
                <td className={`${cellCls} max-w-[200px] truncate font-semibold text-adm-ink`}>
                  {d.full_name ? `Dr. ${d.full_name}` : d.email}
                </td>
                <td className={`${cellCls} font-mono text-adm-muted`}>{d.license_number || "—"}</td>
                <td className={`${cellCls} text-adm-muted`}>{d.specialty || "—"}</td>
                <td className={`${cellCls} max-w-[180px] truncate text-adm-muted`}>{d.facility || "—"}</td>
                <td className={`${cellCls} text-adm-muted`}>{d.patients}</td>
                <td className={cellCls}>
                  <StatusPill tone={d.verified ? "green" : "amber"}>{t(d.verified ? "adm.doc.stVerified" : "adm.doc.stPending")}</StatusPill>
                </td>
                <td className={`${cellCls} text-right`}>
                  {data.verification_available && (
                    <button
                      type="button"
                      onClick={() => verify(d.id, !d.verified, name)}
                      className={`text-xs font-semibold hover:underline ${d.verified ? "text-adm-red" : "text-adm-teal"}`}
                    >
                      {t(d.verified ? "adm.doc.revoke" : "adm.doc.verify")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {slice.length === 0 && (
            <tr>
              <td colSpan={7} className="p-3">
                <StateBox kind="empty" />
              </td>
            </tr>
          )}
        </DataTable>
      )}

      {inviting && (
        <InviteDialog
          presetRole="doctor"
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
