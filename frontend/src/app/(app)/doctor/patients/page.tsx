"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { PanelPatient } from "@/lib/types";

interface CreateResponse {
  patient_id: string;
  method: string;
  email: string;
  temp_password: string | null;
  message: string;
}

const inputCls =
  "w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

export default function PatientsPage() {
  const { t } = useI18n();
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [loading, setLoading] = useState(true);

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

  const load = useCallback(async () => {
    try {
      const r = await api<{ patients: PanelPatient[] }>("/api/patients");
      setPatients(r.patients);
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("patients.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("patients.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLink(true)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("patients.addExisting")}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + {t("patients.new")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {t("patients.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((p) => (
            <Link
              key={p.id}
              href={`/doctor/patients/${p.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">
                  {(p.full_name ?? "?")
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {p.full_name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-slate-500">{p.email}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {p.record_counts.predictions} {t("patients.predictions")} ·{" "}
                {p.record_counts.scans} {t("patients.scans")}
              </p>
              <p className="mt-2 text-xs font-semibold text-teal-600">
                {t("patients.view")} →
              </p>
            </Link>
          ))}
        </div>
      )}

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
