"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Btn, Modal, Notice, fieldCls, labelCls } from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["patient", "doctor", "admin"];

/** Invite a user by email (Supabase sends the set-password link). */
export default function InviteDialog({ onClose, onDone, presetRole }: { onClose: () => void; onDone: (email: string) => void; presetRole?: Role }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(presetRole ?? "doctor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/users/invite", { method: "POST", body: JSON.stringify({ email, full_name: name, role }) });
      onDone(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("adm.users.inviteTitle")} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-xs text-adm-muted">{t("adm.users.inviteDesc")}</p>
        <label className={labelCls}>
          {t("adm.users.colName")}
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
        </label>
        <label className={labelCls}>
          {t("adm.users.colEmail")}
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} />
        </label>
        <label className={labelCls}>
          {t("adm.users.colRole")}
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={fieldCls}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </label>
        {error && <Notice ok={false}>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>{t("common.cancel")}</Btn>
          <Btn type="submit" variant="primary" icon={UserPlus} disabled={busy}>
            {busy ? t("auth.working") : t("adm.users.send")}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
