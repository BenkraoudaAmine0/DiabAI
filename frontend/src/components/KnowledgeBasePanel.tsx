"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { formatDateTime, humanSize } from "@/lib/format";
import type { KbDocument, KbKind, KbLimits, KbStatus } from "@/lib/types";

const ACCEPT = ".pdf,.epub,.docx,.txt,.md";
const POLL_MS = 3000;

const STATUS_BADGE: Record<KbStatus, string> = {
  processing: "bg-amber-100 text-amber-700",
  ready: "bg-teal-100 text-teal-700",
  failed: "bg-red-100 text-red-700",
};

/** "3 tables · 5 images read · 2 images skipped" under a document's name. */
function ExtractionLine({ stats }: { stats: NonNullable<KbDocument["extraction"]> }) {
  const { t } = useI18n();
  const parts = [
    stats.tables > 0 && t("kb.tables", { n: stats.tables }),
    stats.figures > 0 && t("kb.figures", { n: stats.figures }),
    stats.ocr_pages > 0 && t("kb.ocr", { n: stats.ocr_pages }),
  ].filter(Boolean);
  if (parts.length === 0 && stats.images_skipped === 0) return null;
  return (
    <p className="truncate text-xs text-teal-600">
      {parts.join(" · ")}
      {stats.images_skipped > 0 && (
        <span className="text-amber-600">
          {parts.length > 0 && " · "}
          {t("kb.skipped", { n: stats.images_skipped })}
        </span>
      )}
    </p>
  );
}

/** Admin: upload documents & books to the chatbot's knowledge base, follow
 *  their ingestion (polled while any is processing), re-index or delete. */
export default function KnowledgeBasePanel() {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [limits, setLimits] = useState<KbLimits | null>(null);
  // the chatbot only searches documents embedded by this model
  const [model, setModel] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<KbKind>("document");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : t("common.error")),
    [t]
  );

  const load = useCallback(
    () =>
      api<{ documents: KbDocument[]; limits: KbLimits; embedding_model?: string }>(
        "/api/admin/kb/documents"
      )
        .then((r) => {
          setDocs(r.documents);
          setLimits(r.limits);
          setModel(r.embedding_model ?? null);
        })
        .catch(fail),
    [fail]
  );

  useEffect(() => {
    load();
  }, [load]);

  // ingestion runs in the background on the server — poll until it settles
  const processing = docs.some((d) => d.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [processing, load]);

  const maxMb = limits ? (kind === "book" ? limits.book_mb : limits.document_mb) : null;

  function pick(f: File | null) {
    setFile(f);
    setError(null);
  }

  async function upload() {
    if (!file) return;
    if (maxMb && file.size > maxMb * 1024 * 1024) {
      setError(t("kb.tooLarge", { mb: maxMb }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (title.trim()) form.append("title", title.trim());
      if (author.trim()) form.append("author", author.trim());
      await api("/api/admin/kb/documents", { method: "POST", body: form });
      setFile(null);
      setTitle("");
      setAuthor("");
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function reindex(doc: KbDocument) {
    setError(null);
    try {
      await api(`/api/admin/kb/documents/${doc.id}/reindex`, { method: "POST" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function remove(doc: KbDocument) {
    if (!window.confirm(t("kb.confirmDelete", { title: doc.title }))) return;
    setError(null);
    try {
      await api(`/api/admin/kb/documents/${doc.id}`, { method: "DELETE" });
      setDocs((all) => all.filter((d) => d.id !== doc.id));
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t("kb.title")}</h2>
          <p className="text-sm text-slate-500">{t("kb.subtitle")}</p>
          {model && (
            <p className="mt-0.5 text-xs text-slate-400">
              {t("kb.embeddingModel", {
                model: model.replace(/^(local|gemini):/, ""),
                where: t(model.startsWith("local:") ? "kb.local" : "kb.gemini"),
              })}
            </p>
          )}
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
          {(["document", "book"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                kind === k ? "bg-white text-teal-700 shadow-sm" : "text-slate-500"
              }`}
            >
              {t(`kb.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {/* upload form */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex min-w-0 items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:border-teal-500 hover:text-teal-600"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path
              d="M12 16V8m0 0l-3 3m3-3l3 3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="truncate">
            {file ? `${file.name} · ${humanSize(file.size)}` : t("kb.chooseFile")}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("kb.titlePlaceholder")}
          maxLength={200}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={t("kb.authorPlaceholder")}
          maxLength={200}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
        <button
          onClick={upload}
          disabled={!file || busy}
          className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t("kb.uploading")}
            </span>
          ) : (
            t("kb.upload")
          )}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {maxMb !== null && t("kb.formatsRich", { mb: maxMb })}
        {kind === "book" && <> {t("kb.bookHint")}</>}
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {/* documents */}
      {docs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("kb.empty")}</p>
      ) : (
        <div className="scroll-slim mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="whitespace-nowrap px-2 pb-2 font-semibold first:pl-0">{t("kb.colDocument")}</th>
                <th className="whitespace-nowrap px-2 pb-2 font-semibold first:pl-0">{t("kb.colType")}</th>
                <th className="whitespace-nowrap px-2 pb-2 font-semibold first:pl-0">{t("kb.colStatus")}</th>
                <th className="whitespace-nowrap px-2 pb-2 text-right font-semibold">{t("kb.colSize")}</th>
                <th className="whitespace-nowrap px-2 pb-2 text-right font-semibold">{t("kb.colPages")}</th>
                <th className="whitespace-nowrap px-2 pb-2 text-right font-semibold">{t("kb.colChunks")}</th>
                <th className="whitespace-nowrap px-2 pb-2 text-right font-semibold">{t("kb.colAdded")}</th>
                <th className="pb-2 pl-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const pct =
                  d.status === "processing" && d.chunk_count
                    ? Math.round((d.chunks_embedded / d.chunk_count) * 100)
                    : null;
                return (
                  <tr key={d.id} className="border-t border-slate-100 align-top">
                    <td className="py-2.5 pr-2">
                      <div className="w-56 sm:w-64">
                        <p className="truncate font-medium text-slate-800" title={d.title}>
                          {d.title}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {[d.author, d.file_name].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {d.extraction && <ExtractionLine stats={d.extraction} />}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">{t(`kb.${d.kind}`)}</td>
                    <td className="px-2 py-2.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[d.status]}`}
                      >
                        {t(`kb.status.${d.status}`)}
                        {pct !== null && ` · ${pct}%`}
                      </span>
                      {pct !== null && (
                        <div className="mt-1.5 h-1 w-24 rounded-full bg-slate-100">
                          <div
                            className="h-1 rounded-full bg-amber-500 transition-all"
                            style={{ width: `${Math.max(3, pct)}%` }}
                          />
                        </div>
                      )}
                      {d.status === "ready" && model && d.embedding_model !== model && (
                        <p className="mt-1 w-56 text-xs text-amber-600" title={d.embedding_model ?? ""}>
                          {t("kb.stale")}
                        </p>
                      )}
                      {d.status === "failed" && d.error && (
                        <p
                          className="mt-1 line-clamp-2 w-56 text-xs text-red-500"
                          title={d.error}
                        >
                          {d.error}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-slate-600">
                      {d.size_bytes != null ? humanSize(d.size_bytes) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-slate-600">{d.page_count ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-slate-600">{d.chunk_count ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs text-slate-400">
                      {formatDateTime(d.created_at, lang)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-3 text-right text-xs font-semibold">
                      {d.status !== "processing" && d.storage_path && (
                        <button
                          onClick={() => reindex(d)}
                          className="text-teal-600 hover:text-teal-800"
                        >
                          {t("kb.reindex")}
                        </button>
                      )}
                      <button
                        onClick={() => remove(d)}
                        className="ml-3 text-red-500 hover:text-red-700"
                      >
                        {t("kb.delete")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
