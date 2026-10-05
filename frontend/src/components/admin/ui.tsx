"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Inbox, RefreshCw, Search, X, type LucideIcon } from "lucide-react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

/* Building blocks of the Figma "05 Admin Screens" pages. */

export const TONES = {
  green: { pill: "bg-adm-green-bg text-adm-green", dot: "bg-adm-green", bar: "bg-adm-green" },
  blue: { pill: "bg-adm-blue-bg text-adm-blue", dot: "bg-adm-blue", bar: "bg-adm-blue" },
  amber: { pill: "bg-adm-amber-bg text-adm-amber", dot: "bg-adm-amber", bar: "bg-adm-amber" },
  red: { pill: "bg-adm-red-bg text-adm-red", dot: "bg-adm-red", bar: "bg-adm-red" },
  slate: { pill: "bg-adm-soft text-adm-muted", dot: "bg-adm-muted", bar: "bg-adm-muted" },
  teal: { pill: "bg-adm-tint text-adm-teal", dot: "bg-adm-teal", bar: "bg-adm-teal" },
} as const;
export type Tone = keyof typeof TONES;

export const card = "rounded-[14px] border border-adm-border bg-white shadow-[0_4px_18px_rgba(23,50,58,0.05)]";

/** Loads an admin endpoint; `reload()` refetches. */
export function useAdminApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, error, loading: loading && !data && !error, reload };
}

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-[5px] text-[11px] font-semibold ${TONES[tone].pill}`}>
      <span className={`size-1.5 rounded-full ${TONES[tone].dot}`} aria-hidden />
      {children}
    </span>
  );
}

export function PageHeading({ title, subtitle, onRefresh }: { title: string; subtitle: string; onRefresh?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-[5px]">
        <h1 className="text-[28px] font-bold tracking-[-0.56px] text-adm-ink">{title}</h1>
        <p className="text-[13px] text-adm-muted">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t("adm.refresh")}
            title={t("adm.refresh")}
            className="flex size-8 items-center justify-center rounded-full text-adm-muted hover:bg-white"
          >
            <RefreshCw size={14} />
          </button>
        )}
        <span className="inline-flex items-center gap-[7px] rounded-full bg-adm-green-bg px-[11px] py-[7px] text-xs font-semibold text-adm-green">
          <span className="size-[7px] rounded-full bg-adm-green" aria-hidden />
          {t("adm.live")}
        </span>
      </div>
    </div>
  );
}

/** Overview KPI (label + icon tile, big value, coloured change line). */
export function KpiCard({
  label,
  value,
  change,
  icon: IconCmp,
  tone,
}: {
  label: string;
  value: ReactNode;
  change?: ReactNode;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-[9px] p-[15px] ${card}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-adm-muted">{label}</p>
        <span className={`flex size-[30px] shrink-0 items-center justify-center rounded-[10px] ${TONES[tone].pill}`}>
          <IconCmp size={16} />
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <p className="text-2xl font-bold tracking-[-0.48px] text-adm-ink">{value}</p>
        {change && <p className={`text-[11px] font-semibold ${TONES[tone].pill.split(" ")[1]}`}>{change}</p>}
      </div>
    </div>
  );
}

/** List-page summary (icon, value, label) — the 70px cards. */
export function SummaryCard({ icon: IconCmp, value, label, tone = "teal" }: { icon: LucideIcon; value: ReactNode; label: string; tone?: Tone }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[10px] border border-adm-border bg-white p-[14px]">
      <IconCmp size={20} className={TONES[tone].pill.split(" ")[1]} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-lg font-bold text-adm-ink">{value}</p>
        <p className="truncate text-[11px] text-adm-muted">{label}</p>
      </div>
    </div>
  );
}

export function Panel({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 p-4 ${card} ${className}`}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-adm-ink">{title}</h2>}
          {aside && <div className="text-xs text-adm-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-[38px] w-full items-center gap-2 rounded-[10px] border border-adm-border bg-white px-3 sm:w-[330px]">
      <Search size={16} className="shrink-0 text-adm-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs text-adm-ink outline-none placeholder:text-adm-muted"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="×" className="text-adm-muted hover:text-adm-ink">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex h-[38px] items-center gap-[7px] rounded-[10px] border border-adm-border bg-white pl-[11px] pr-2">
      <span className="text-[11px] text-adm-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="max-w-[170px] cursor-pointer bg-transparent text-xs font-semibold text-adm-ink outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Btn({
  children,
  onClick,
  variant = "secondary",
  icon: IconCmp,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  icon?: LucideIcon;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const look = {
    primary: "bg-adm-teal text-white hover:opacity-90",
    secondary: "border border-adm-border bg-white text-adm-ink hover:bg-adm-soft",
    danger: "border border-adm-red bg-white text-adm-red hover:bg-adm-red-bg",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-[38px] shrink-0 items-center gap-2 rounded-[10px] px-[14px] text-xs font-semibold disabled:opacity-50 ${look}`}
    >
      {IconCmp && <IconCmp size={16} />}
      {children}
    </button>
  );
}

/** Loading / empty / error block (the "Table state examples" of the Figma). */
export function StateBox({ kind, message, onRetry }: { kind: "loading" | "empty" | "error"; message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  if (kind === "loading") {
    return (
      <div className="flex flex-col gap-2 rounded-[10px] border border-adm-border bg-white p-3" aria-busy>
        <p className="text-[11px] font-bold text-adm-ink">{t("adm.loading")}</p>
        <div className="h-2 w-full animate-pulse rounded-full bg-[#e7eef0]" />
        <div className="h-2 w-[190px] animate-pulse rounded-full bg-[#e7eef0]" />
      </div>
    );
  }
  if (kind === "empty") {
    return (
      <div className="flex items-center gap-2.5 rounded-[10px] border border-adm-border bg-white p-3">
        <Inbox size={22} className="shrink-0 text-adm-teal" />
        <div className="flex flex-col gap-[3px] text-[11px]">
          <p className="font-bold text-adm-ink">{t("adm.empty")}</p>
          <p className="text-adm-muted">{message ?? t("adm.emptyText")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-[#f3c8ce] bg-adm-red-bg p-3 text-adm-red">
      <CircleAlert size={22} className="shrink-0" />
      <div className="flex min-w-0 flex-col gap-[3px] text-[11px]">
        <p className="font-bold">{t("adm.error")}</p>
        <p className="break-words">
          {message ?? t("adm.errorText")}
          {onRetry && (
            <>
              {" · "}
              <button type="button" onClick={onRetry} className="font-semibold underline">
                {t("adm.retry")}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export const PAGE_SIZE = 10;

/** Client-side pagination of an already filtered list. */
export function usePaged<T>(rows: T[], resetKey: string) {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    // filters changed: back to the first page (render-time reset, no effect)
    setLastKey(resetKey);
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = useMemo(() => rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), [rows, current]);
  return { slice, page: current, pages, setPage, total: rows.length };
}

export function Pagination({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (p: number) => void }) {
  const { t } = useI18n();
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);
  const near = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => Math.abs(p - page) <= 1 || p === 1 || p === pages);
  return (
    <div className="flex h-10 items-center justify-between border-t border-adm-border px-[14px] text-[11px] text-adm-muted">
      <span>{t("adm.range", { from, to, total })}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="‹" className="disabled:opacity-30">
          <ChevronLeft size={15} />
        </button>
        {near.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? "flex size-[25px] items-center justify-center rounded-md bg-adm-teal font-bold text-white" : "px-1 hover:text-adm-ink"}
          >
            {p}
          </button>
        ))}
        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="›" className="disabled:opacity-30">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/** Figma data table: uppercase header row, 43px rows, footer pagination. */
export function DataTable({ head, children, footer }: { head: string[]; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-adm-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="h-[38px] bg-adm-soft text-[11px] font-semibold uppercase tracking-[0.44px] text-adm-muted">
              {head.map((h, i) => (
                <th key={i} className="px-[14px] font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs">{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export const rowCls = "h-[43px] border-t border-adm-border";
export const cellCls = "px-[14px] py-2";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-adm-ink/40 p-4" role="dialog" aria-modal aria-label={title} onMouseDown={onClose}>
      <div className={`w-full max-w-lg p-6 ${card}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-adm-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="×" className="text-adm-muted hover:text-adm-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldCls =
  "h-[38px] w-full rounded-[10px] border border-adm-border bg-white px-3 text-sm text-adm-ink outline-none focus:border-adm-teal";
export const labelCls = "flex flex-col gap-1.5 text-xs font-semibold text-adm-muted";

export function Notice({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className={`rounded-[10px] px-3 py-2 text-xs font-semibold ${ok ? "bg-adm-green-bg text-adm-green" : "bg-adm-red-bg text-adm-red"}`}>{children}</p>
  );
}
