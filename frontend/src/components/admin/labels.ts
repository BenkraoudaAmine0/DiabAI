import type { Tone } from "@/components/admin/ui";
import type {
  AccountStatus,
  AlertLevel,
  AlertStatus,
  DirectoryStatus,
  ModelStatus,
  ServiceStatus,
} from "@/lib/admin";

export const ACCOUNT_TONE: Record<AccountStatus, Tone> = {
  active: "green",
  invited: "blue",
  pending: "amber",
  suspended: "red",
};

export const SERVICE_TONE: Record<ServiceStatus, Tone> = {
  operational: "green",
  degraded: "amber",
  down: "red",
};

export const LEVEL_TONE: Record<AlertLevel, Tone> = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "slate",
};

export const ALERT_STATUS_TONE: Record<AlertStatus, Tone> = {
  open: "red",
  investigating: "amber",
  resolved: "green",
};

export const MODEL_TONE: Record<ModelStatus, Tone> = {
  production: "green",
  validated: "green",
  staging: "blue",
  candidate: "blue",
  monitoring: "amber",
  retired: "slate",
};

export const DIRECTORY_TONE: Record<DirectoryStatus, Tone> = {
  stable: "green",
  needs_review: "amber",
  new: "blue",
  high_risk: "red",
};

/** Readable audit action ("prediction.create" → "Ran a risk assessment"),
 *  or the raw code for an action without a label yet. */
export function actionLabel(t: (k: string) => string, action: string): string {
  const key = `adm.act.${action}`;
  const text = t(key);
  return text === key ? action : text;
}

/** Same label as a standalone line (first letter capitalised). */
export function actionLine(t: (k: string) => string, action: string): string {
  const text = actionLabel(t, action);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
