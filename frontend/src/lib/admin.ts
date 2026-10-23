/** Admin API shapes (backend/app/routers/admin*.py) and small helpers. */

import type { ClinicalStatus, Role } from "@/lib/types";

export type AccountStatus = "active" | "invited" | "pending" | "suspended";
export type ServiceStatus = "operational" | "degraded" | "down";
export type AlertLevel = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "investigating" | "resolved";
export type AuditCategory = "views" | "clinical" | "admin" | "security";
export type ModelStatus = "candidate" | "staging" | "validated" | "production" | "monitoring" | "retired";
export type ModelTask = "diabetes_risk" | "retina" | "foot" | "neck" | "embeddings" | "llm" | "other";

export const MODEL_STATUSES: ModelStatus[] = ["candidate", "staging", "validated", "production", "monitoring", "retired"];
export const MODEL_TASKS: ModelTask[] = ["diabetes_risk", "retina", "foot", "neck", "embeddings", "llm", "other"];

export interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
  status: AccountStatus | null;
  last_sign_in_at: string | null;
  has_2fa: boolean;
  counts?: { predictions_made: number; predictions_received: number; scans_performed: number; scans_received: number };
}

export interface UsersResponse {
  users: AdminUserRow[];
  summary: { total: number; active: number; pending: number; suspended: number };
  auth_available: boolean;
}

export interface DoctorRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  specialty?: string | null;
  license_number?: string | null;
  facility?: string | null;
  verified: boolean;
  patients: number;
}

export interface DoctorsResponse {
  doctors: DoctorRow[];
  summary: { total: number; verified: number; pending: number; facilities: number; links: number; avg_patients: number };
  verification_available: boolean;
}

export type DirectoryStatus = "stable" | "needs_review" | "new" | "high_risk";

export interface DirectoryRow {
  id: string;
  name: string;
  condition: ClinicalStatus;
  care_team: string | null;
  care_team_size: number;
  status: DirectoryStatus;
  created_at: string;
}

export interface PatientsResponse {
  patients: DirectoryRow[];
  summary: { total: number; stable: number; needs_review: number; high_risk: number; new: number };
}

export interface AuditEvent {
  id: number;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  category: AuditCategory;
  target_type: string | null;
  target_id?: string | null;
  target_role?: string | null; // patient / doctor / admin when target_type is "profile"
  target_label: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AuditResponse {
  events: AuditEvent[];
  total: number;
  actors: { id: string; name: string }[];
  today: Partial<Record<AuditCategory, number>>;
}

export interface Integrity {
  total: number;
  broken: number;
  first_broken: number | null;
  last_hash: string | null;
  checked_at: string;
}

export interface AlertRow {
  id: number;
  level: AlertLevel;
  status: AlertStatus;
  source: string;
  message: string;
  detail: { count?: number; status?: number; last_seen?: string } & Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  service?: string;
  // who hit the error (patients as their PT- code)
  user_id?: string | null;
  user_label?: string | null;
  user_role?: string | null;
}

export interface AlertsResponse {
  alerts: AlertRow[];
  summary: { unresolved: number; critical: number; investigating: number; mean_response_min: number | null };
}

export interface RegistryRow {
  id: string;
  name: string;
  version: string;
  task: ModelTask;
  status: ModelStatus;
  metrics: Record<string, number | string>;
  artifact: string | null;
  sha256: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetectedModel {
  key: string;
  task: ModelTask;
  loaded: boolean;
  artifact?: string;
  size_bytes?: number;
  modified_at?: string;
  sha256?: string;
  threshold?: number;
  missing?: string[];
  registered_as?: { id: string; name: string; version: string; status: ModelStatus } | null;
}

export interface ModelsResponse {
  registry: RegistryRow[];
  detected: DetectedModel[];
  summary: { registered: number; production: number; needs_review: number; loaded: number; expected: number };
  registry_available: boolean;
}

export interface HealthResponse {
  checked_at: string;
  services: {
    api: { status: ServiceStatus; uptime_seconds: number; p95_ms: number | null; requests_per_minute: number; incidents_30d: number };
    database: { status: ServiceStatus; latency_ms: number; storage_ok: boolean; storage_latency_ms: number; error: string | null; incidents_30d: number };
    ml: { status: ServiceStatus; loaded: number; total: number; models: Record<string, boolean>; p95_ms: number | null; incidents_30d: number };
    ai: { status: ServiceStatus; configured: boolean; model: string; embeddings: string; calls_24h: number; cost_24h_usd: number; last_call: string | null; incidents_30d: number };
  };
  incidents: AlertRow[];
  traffic?: {
    uptime_seconds: number;
    requests: number;
    requests_per_minute: number;
    server_errors: number;
    api_p95_ms: number | null;
    ml_p95_ms: number | null;
    minutes: { minute: number; requests: number; ml_requests: number; p95_ms: number | null }[];
  };
}

export interface OverviewResponse {
  kpis: {
    users: number;
    users_new_week: number;
    doctors: number;
    doctors_verified: number | null;
    doctors_new_week: number;
    patients: number;
    patients_active_30d: number | null;
    alerts_open: number;
    alerts_critical: number;
  };
  audit: AuditEvent[];
  models: { registry: RegistryRow[]; detected: DetectedModel[] };
  health: HealthResponse;
  alerts: AlertRow[];
}

export interface SecurityResponse {
  kpis: { privileged: number; privileged_2fa: number; adoption_pct: number | null; signed_in_24h: number; findings: number };
  roles: Record<Role, { members: number; with_2fa: number }>;
  findings: { code: string; count: number | null; level: "low" | "medium" | "high" }[];
  signins: { id: string; name: string | null; role: Role; at: string }[];
  settings: { require_mfa_privileged: boolean };
  auth_available: boolean;
  me_has_2fa: boolean;
}

export interface DeletionRequestRow {
  id: string;
  user_id: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user: { id: string; email: string | null; full_name: string | null; role: Role } | null;
}

/** "3 min ago" / "il y a 3 min" with Intl (no translation keys needed). */
export function timeAgo(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const rtf = new Intl.RelativeTimeFormat(lang === "fr" ? "fr" : "en", { numeric: "auto", style: "short" });
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Math.abs(seconds) < 60) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export function shortDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function clockTime(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function duration(seconds: number, lang: string): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const unit = lang === "fr" ? { d: "j", h: "h", m: "min" } : { d: "d", h: "h", m: "min" };
  if (d) return `${d} ${unit.d} ${h} ${unit.h}`;
  if (h) return `${h} ${unit.h} ${m} ${unit.m}`;
  return `${m} ${unit.m}`;
}

export function bytes(n: number | undefined): string {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Client-side CSV for the rows currently shown (UTF-8 BOM for Excel). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Admin page that lists a person: patients by their PT- code, doctors and
 *  other staff by name (the lists read ?q=). */
export function personHref(role: string | null | undefined, label: string | null | undefined): string | null {
  if (!label) return null;
  const q = encodeURIComponent(label);
  if (role === "patient") return `/admin/patients?q=${q}`;
  if (role === "doctor") return `/admin/doctors?q=${q}`;
  if (role) return `/admin/users?q=${q}`;
  return null;
}

/** Where an audit event's target opens, if anywhere. */
export function auditTargetHref(e: Pick<AuditEvent, "target_type" | "target_role" | "target_label">): string | null {
  if (e.target_type === "profile") return personHref(e.target_role, e.target_label);
  if (e.target_type === "model") return "/admin/models";
  return null;
}

/** Fired after an admin approves or revokes a doctor (bell + badge refresh). */
export const DOCTORS_CHANGED = "diabai:doctors-changed";
