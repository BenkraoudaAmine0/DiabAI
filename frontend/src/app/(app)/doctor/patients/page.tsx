"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import ClinicalBadge from "@/components/ClinicalBadge";
import Icon from "@/components/Icon";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { dayLabel, daysSince, fold, shortId } from "@/lib/clinical";
import type { ClinicalStatus, PanelPatient } from "@/lib/types";

interface CreateResponse {
  patient_id: string;
  method: string;
  email: string;
  temp_password: string | null;
  message: string;
}

const inputCls =
  "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const filterCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const PAGE_SIZE = 10;
const STATUSES: ClinicalStatus[] = ["diabetic", "prediabetic", "moderate", "normal", "none"];
type StatusFilter = "all" | "pending" | ClinicalStatus;
type DateFilter = "all" | "7" | "30" | "90" | "older" | "never";

function matchesQuery(p: PanelPatient, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(`${p.full_name ?? ""} ${p.email ?? ""} ${p.id}`);
  const digits = query.replace(/\D/g, "");
  const phone = (p.phone ?? "").replace(/\D/g, "");
  return words.every((w) => haystack.includes(w)) || (digits.length >= 4 && phone.includes(digits));
}

function matchesStatus(p: PanelPatient, f: StatusFilter): boolean {
  if (f === "all") return true;
  if (f === "pending") return p.pending_reviews > 0;
  return p.status === f;
}

function matchesDate(p: PanelPatient, f: DateFilter): boolean {
  const days = daysSince(p.last_activity_at);
  switch (f) {
    case "all":
      return true;
    case "never":
      return days === null;
    case "older":
      return days !== null && days > 90;
    default:
      return days !== null && days <= Number(f);
  }
}

/** Figma "patient-list": search, classification and date filters, table,
 *  pagination, loading skeleton and empty state. No wilaya. */
export default function PatientsPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [when, setWhen] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);

  // create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [method, setMethod] = useState<"invite" | "temp_password">("invite");
  const [cForm, setCForm] = useState({
    email: "",
    full_name: "",
    dob: "",
    sex: "",
    phone: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResponse | null>(null);

  // link modal state
  const [showLink, setShowLink] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ patients: PanelPatient[] }>("/api/patients")
        .then((r) => {
          setPatients(r.patients);
          setLoadError(null);
        })
        .catch((e) => setLoadError(e instanceof Error ? e.message : t("common.error")))
        .finally(() => setLoading(false)),
    [t]
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      patients.filter(
        (p) => matchesQuery(p, query) && matchesStatus(p, status) && matchesDate(p, when)
      ),
    [patients, query, status, when]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filtersOn = query !== "" || status !== "all" || when !== "all";

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setWhen("all");
    setPage(1);
  }

  async function createPatient(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api<CreateResponse>("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          method,
          email: cForm.email,
          full_name: cForm.full_name,
          dob: cForm.dob || null,
          sex: cForm.sex || null,
          phone: cForm.phone || null,
        }),
      });
      setCreated(res);
      load();
    } catch (e2) {
      setCreateError(e2 instanceof Error ? e2.message : t("common.error"));
    } finally {
      setCreating(false);
    }
  }

  async function linkPatient(e: React.FormEvent) {
    e.preventDefault();
    setLinkBusy(true);
    setLinkError(null);
    setLinkMsg(null);
    try {
      await api("/api/patients/link", {
        method: "POST",
        body: JSON.stringify({ email: linkEmail }),
      });
      setLinkMsg(t("patients.linked"));
      setLinkEmail("");
      setShowLink(false);
      load();
    } catch (e2) {
      setLinkError(e2 instanceof Error ? e2.message : t("common.error"));
    } finally {
      setLinkBusy(false);
    }
  }

  function closeCreate() {
    setShowCreate(false);
    setCreated(null);
    setCreateError(null);
    setCForm({ email: "", full_name: "", dob: "", sex: "", phone: "" });
  }

  return (
    <div className="space-y-6">
      {/* title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-extrabold text-slate-900">{t("patients.title")}</h1>
          {!loading && (
            <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-bold text-brand">
              {t("patients.total", { n: patients.length })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={resetFilters}
            disabled={!filtersOn}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("patients.reset")}
          </button>
          <button
            onClick={() => setShowLink(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Icon name="userPlus" size={14} />
            {t("patients.addExisting")}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
          >
            <Icon name="plus" size={14} />
            {t("patients.new")}
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_200px_220px]">
        <label className="relative block">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("patients.searchPlaceholder")}
            aria-label={t("patients.searchPlaceholder")}
            className={`${filterCls} pl-[34px] font-normal`}
          />
        </label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
          aria-label={t("patients.colStatus")}
          className={filterCls}
        >
          <option value="all">{t("patients.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`clinical.${s}`)}
            </option>
          ))}
          <option value="pending">{t("patients.pendingOnly")}</option>
        </select>
        <select
          value={when}
          onChange={(e) => {
            setWhen(e.target.value as DateFilter);
            setPage(1);
          }}
          aria-label={t("patients.colLast")}
          className={filterCls}
        >
          <option value="all">{t("patients.anyDate")}</option>
          <option value="7">{t("patients.last7")}</option>
          <option value="30">{t("patients.last30")}</option>
          <option value="90">{t("patients.last90")}</option>
          <option value="older">{t("patients.older90")}</option>
          <option value="never">{t("patients.never")}</option>
        </select>
      </div>

      {/* table */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        {loadError ? (
          <p className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{loadError}</p>
        ) : !loading && patients.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-500">{t("patients.empty")}</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
            >
              <Icon name="plus" size={16} />
              {t("patients.new")}
            </button>
          </div>
        ) : !loading && filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Icon name="xCircle" size={28} />
            </span>
            <p className="mt-4 text-sm font-bold text-slate-900">{t("patients.noMatch")}</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">{t("patients.noMatchDesc")}</p>
            <button
              onClick={resetFilters}
              className="mt-4 rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              {t("patients.reset")}
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="pb-5 pr-4 font-bold">{t("patients.colName")}</th>
                    <th className="w-[146px] pb-5 pr-4 font-bold">{t("patients.colId")}</th>
                    <th className="w-[86px] pb-5 pr-4 font-bold">{t("patients.colAge")}</th>
                    <th className="w-[176px] pb-5 pr-4 font-bold">{t("patients.colLast")}</th>
                    <th className="w-[230px] pb-5 font-bold">{t("patients.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? [0, 1, 2, 3, 4].map((i) => (
                        <tr key={i} className="border-b border-slate-200">
                          <td className="py-3" colSpan={5}>
                            <div className="h-4 w-[180px] animate-pulse rounded bg-slate-200" />
                            <div className="mt-2 h-2.5 animate-pulse rounded bg-slate-100" />
                          </td>
                        </tr>
                      ))
                    : shown.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/doctor/patients/${p.id}`)}
                          className="cursor-pointer border-b border-slate-200 transition-colors hover:bg-[#f6faf8]"
                        >
                          <td className="py-3 pr-4">
                            <Link
                              href={`/doctor/patients/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate text-sm font-bold text-slate-900 hover:text-brand"
                            >
                              {p.full_name ?? p.email ?? "—"}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 font-mono text-[13px] text-slate-500">
                            PT-{shortId(p.id).toUpperCase()}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-sm text-slate-900">
                            {p.age != null ? t("common.ageShort", { n: p.age }) : "—"}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-sm text-slate-500">
                            {dayLabel(p.last_activity_at, lang, t)}
                          </td>
                          <td className="py-3">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <ClinicalBadge status={p.status} withIcon />
                              {p.pending_reviews > 0 && (
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">
                                  {t("patients.toReview", { n: p.pending_reviews })}
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* pagination */}
            {!loading && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-7 text-[13px]">
                <p className="text-slate-500">
                  {t("patients.showing", {
                    from: (current - 1) * PAGE_SIZE + 1,
                    to: Math.min(current * PAGE_SIZE, filtered.length),
                    total: filtered.length,
                  })}
                </p>
                {pages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage(current - 1)}
                      disabled={current === 1}
                      aria-label={t("common.prev")}
                      className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Icon name="chevronLeft" size={16} />
                    </button>
                    {Array.from({ length: pages }, (_, i) => i + 1)
                      .filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 1)
                      .map((n, i, list) => (
                        <span key={n} className="flex items-center gap-1">
                          {i > 0 && n - list[i - 1] > 1 && <span className="text-slate-500">...</span>}
                          <button
                            onClick={() => setPage(n)}
                            aria-current={n === current ? "page" : undefined}
                            className={`min-w-8 rounded-md px-3 py-1.5 text-[13px] ${
                              n === current ? "bg-brand font-bold text-white" : "font-medium text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {n}
                          </button>
                        </span>
                      ))}
                    <button
                      onClick={() => setPage(current + 1)}
                      disabled={current === pages}
                      aria-label={t("common.next")}
                      className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Icon name="chevronRight" size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── create patient modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            {!created ? (
              <>
                <h2 className="text-lg font-bold text-slate-900">
                  {t("patients.new")}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-600">
                  {t("patients.method")}
                </p>
                <div className="mt-2 grid gap-2">
                  {(
                    [
                      ["invite", "patients.invite", "patients.inviteDesc"],
                      ["temp_password", "patients.temp", "patients.tempDesc"],
                    ] as const
                  ).map(([value, title, desc]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                        method === value
                          ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600"
                          : "border-slate-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="method"
                        checked={method === value}
                        onChange={() => setMethod(value)}
                        className="mt-1 accent-teal-600"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          {t(title)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {t(desc)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <form onSubmit={createPatient} className="mt-4 space-y-3">
                  <input
                    type="email"
                    required
                    placeholder={t("common.email")}
                    value={cForm.email}
                    onChange={(e) =>
                      setCForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className={inputCls}
                  />
                  <input
                    required
                    placeholder={t("common.fullName")}
                    value={cForm.full_name}
                    onChange={(e) =>
                      setCForm((f) => ({ ...f, full_name: e.target.value }))
                    }
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">
                        {t("common.dob")} ({t("common.optional")})
                      </span>
                      <input
                        type="date"
                        value={cForm.dob}
                        onChange={(e) =>
                          setCForm((f) => ({ ...f, dob: e.target.value }))
                        }
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">
                        {t("common.sex")} ({t("common.optional")})
                      </span>
                      <select
                        value={cForm.sex}
                        onChange={(e) =>
                          setCForm((f) => ({ ...f, sex: e.target.value }))
                        }
                        className={inputCls}
                      >
                        <option value="">—</option>
                        <option value="male">{t("common.male")}</option>
                        <option value="female">{t("common.female")}</option>
                      </select>
                    </label>
                  </div>
                  <input
                    placeholder={`${t("common.phone")} (${t("common.optional")})`}
                    value={cForm.phone}
                    onChange={(e) =>
                      setCForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    className={inputCls}
                  />

                  {createError && (
                    <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                      {createError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeCreate}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {creating ? t("auth.working") : t("patients.create")}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* ── one-time credential reveal ── */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    ✓
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    {t("patients.created")}
                  </h2>
                </div>

                {created.method === "invite" ? (
                  <p className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-700">
                    {t("patients.inviteSent").replace(
                      "{email}",
                      created.email
                    )}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {t("patients.tempShown")}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-slate-800">
                        {created.temp_password}
                      </code>
                      <CopyButton text={created.temp_password ?? ""} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {created.email} — {t("common.email")}
                    </p>
                  </div>
                )}

                <button
                  onClick={closeCreate}
                  className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── link existing modal ──────────────────────────────────────────── */}
      {showLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {t("patients.linkTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("patients.linkDesc")}
            </p>
            <form onSubmit={linkPatient} className="mt-4 space-y-3">
              <input
                type="email"
                required
                placeholder={t("common.email")}
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                className={inputCls}
              />
              {linkError && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  {linkError}
                </p>
              )}
              {linkMsg && (
                <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {linkMsg}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLink(false)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={linkBusy}
                  className="flex-1 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {linkBusy ? t("auth.working") : t("patients.link")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
    >
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}
