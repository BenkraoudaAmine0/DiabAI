"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { useI18n } from "@/i18n";

/** Shared pieces of the Figma doctor screens (02 Doctor Screens). */

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

/** "Icon-Container": 48px, 10px radius. */
export function IconTile({
  icon: IconCmp,
  tone = "bg-[#e6f2eb] text-brand",
  size = 48,
}: {
  icon: LucideIcon;
  tone?: string;
  size?: number;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[10px] ${tone}`}
      style={{ width: size, height: size }}
    >
      <IconCmp size={size / 2} strokeWidth={1.8} />
    </span>
  );
}

/** "Status-Badge": 6px radius, bold 11px. */
export function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold ${tone}`}>
      {children}
    </span>
  );
}

export const BADGE = {
  green: "bg-[#e6f2eb] text-brand",
  amber: "bg-[#fef3c7] text-status-prediabetes",
  slate: "bg-slate-100 text-slate-500",
  red: "bg-[#fee2e2] text-status-critical",
  orange: "bg-[#ffedd5] text-status-diabetes",
  normal: "bg-[#dcfce7] text-status-normal",
  teal: "bg-brand-teal text-white",
} as const;

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 ${className}`}>
      {children}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = "any",
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-700">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-medium text-slate-900 outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
      />
    </label>
  );
}

/** Small segmented control for categorical inputs. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-8 min-w-0 flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${
              value === o.value ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useTriOptions() {
  const { t } = useI18n();
  return [
    { value: "yes" as const, label: t("dr.yes") },
    { value: "no" as const, label: t("dr.no") },
    { value: "unknown" as const, label: t("dr.unknown") },
  ];
}

/** "Link" row: semibold label + chevron, used for "En savoir plus". */
export function MoreLink({
  open,
  onClick,
  tone = "text-brand",
}: {
  open: boolean;
  onClick: () => void;
  tone?: string;
}) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={`inline-flex w-fit items-center gap-2 text-sm font-semibold ${tone}`}>
      {open ? t("dr.less") : t("dr.learnMore")}
      <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
    </button>
  );
}

export function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
