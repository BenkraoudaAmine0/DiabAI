"use client";

import { Database, Sparkles } from "lucide-react";

import KnowledgeBasePanel from "@/components/KnowledgeBasePanel";
import { PageHeading, Panel, StateBox, SummaryCard, useAdminApi } from "@/components/admin/ui";
import { useI18n } from "@/i18n";
import { timeAgo } from "@/lib/admin";
import { humanSize } from "@/lib/format";
import type { AdminStats } from "@/lib/types";

/** Documents and books the AI assistant answers from, with storage and
 *  Gemini usage (not a Figma admin frame: kept from the earlier console). */
export default function AdminKnowledgePage() {
  const { t, lang } = useI18n();
  const { data, error, reload } = useAdminApi<AdminStats>("/api/admin/stats");
  const g = data?.gemini;

  return (
    <>
      <PageHeading title={t("adm.kb.title")} subtitle={t("adm.kb.subtitle")} onRefresh={reload} />
      {error && <StateBox kind="error" message={error} onRetry={reload} />}

      {g && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={Sparkles} value={g.totals.calls} label={t("admin.geminiCalls")} />
          <SummaryCard icon={Sparkles} value={`$${g.totals.estimated_cost_usd.toFixed(4)}`} label={t("admin.estimatedCost")} tone="amber" />
          {Object.entries(data.storage).map(([bucket, u]) => (
            <SummaryCard key={bucket} icon={Database} value={humanSize(u.bytes)} label={`${bucket} · ${u.objects} ${t("admin.objects")}`} tone="blue" />
          ))}
        </div>
      )}

      <div className="rounded-[14px] border border-adm-border bg-white p-1">
        <KnowledgeBasePanel />
      </div>

      {g && (
        <Panel title={t("adm.kb.usage")} aside={g.last_call ? t("adm.kb.lastCall", { time: timeAgo(g.last_call, lang) }) : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.44px] text-adm-muted">
                  <th className="py-2 font-semibold" />
                  <th className="py-2 text-right font-semibold">{t("admin.inputTokens")}</th>
                  <th className="py-2 text-right font-semibold">{t("admin.outputTokens")}</th>
                  <th className="py-2 text-right font-semibold">$</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [t("admin.totals"), g.totals],
                    [t("admin.generate"), g.generate],
                    [t("admin.embedding"), g.embedding],
                  ] as const
                ).map(([label, u]) => (
                  <tr key={label} className="h-[38px] border-t border-adm-border">
                    <td className="font-semibold text-adm-ink">{label}</td>
                    <td className="text-right text-adm-muted">{u.input_tokens.toLocaleString(lang)}</td>
                    <td className="text-right text-adm-muted">{u.output_tokens.toLocaleString(lang)}</td>
                    <td className="text-right text-adm-muted">${u.estimated_cost_usd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
