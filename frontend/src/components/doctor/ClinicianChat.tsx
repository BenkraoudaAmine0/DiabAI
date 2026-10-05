"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleQuestionMark, Plus, TriangleAlert } from "lucide-react";

import PrototypeBanner from "@/components/doctor/PrototypeBanner";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { ChatMessage, ChatSource, PanelPatient } from "@/lib/types";

interface ChatResponse {
  session_id: string;
  answer: string;
  sources: ChatSource[];
}

/** Renders [1]-style citations as numbered chips that select the source
 *  in the right-hand panel. */
function AnswerWithCitations({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const { t } = useI18n();
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {text.split(/(\[\d+\])/g).map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onCite(Number(m[1]))}
            title={t("rag.sources")}
            className="mx-0.5 inline-flex size-5 items-center justify-center rounded-full bg-brand align-middle text-[11px] font-bold text-white hover:opacity-80"
          >
            {m[1]}
          </button>
        );
      })}
    </p>
  );
}

function SourceCard({ s, active }: { s: ChatSource; active: boolean }) {
  const { t } = useI18n();
  const meta = [s.chapter, s.page && `p. ${s.page}`, s.content_type && t(`chat.${s.content_type}`)].filter(Boolean).join(" • ");
  return (
    <div
      id={`src-${s.index}`}
      className={`flex flex-col gap-2 rounded-lg border bg-slate-50 p-3 transition-shadow ${active ? "border-brand ring-2 ring-brand/20" : "border-slate-200"}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{s.index}</span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-900" title={s.title}>
          {s.title}
        </p>
      </div>
      <p className="text-xs text-slate-700">{s.excerpt}</p>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="min-w-0 truncate text-slate-500">{meta}</span>
        <span className="shrink-0 font-semibold text-brand">{t("rag.relevance", { pct: Math.round(s.similarity * 100) })}</span>
      </div>
    </div>
  );
}

/** Figma "Page new" · rag-assistant (2:2546): chat on the left, the cited
 *  sources of the selected answer on the right. A selected panel patient
 *  adds a de-identified summary of the record to the question. */
export default function ClinicianChat() {
  const { t, lang } = useI18n();
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // one conversation = one session: the backend reads its history to
  // understand follow-up questions
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null); // message whose sources are listed
  const [cited, setCited] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ patients: PanelPatient[] }>("/api/patients")
      .then((r) => setPatients(r.patients))
      .catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const lastAnswer = messages.findLastIndex((m) => m.role === "assistant");
  const sourcesOf = shown ?? lastAnswer;
  const sources = sourcesOf >= 0 ? messages[sourcesOf]?.sources ?? [] : [];
  const patient = patients.find((p) => p.id === patientId);

  function cite(messageIndex: number, n: number) {
    setShown(messageIndex);
    setCited(n);
    requestAnimationFrame(() => document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function reset() {
    setMessages([]);
    setSessionId(null);
    setShown(null);
    setCited(null);
    setError(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    setShown(null);
    setCited(null);
    setMessages((m) => [...m, { role: "user", content: message, created_at: new Date().toISOString() }]);
    try {
      const res = await api<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message, session_id: sessionId, lang, patient_id: patientId || null }),
      });
      setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.answer, sources: res.sources, created_at: new Date().toISOString() },
      ]);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PrototypeBanner />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("rag.title")}</h1>
        <p className="text-sm text-slate-500">{t("rag.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex h-[calc(100vh-17rem)] min-h-[560px] flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <label className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold text-slate-500">{t("rag.patient")}</span>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="max-w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-bold text-slate-900 outline-none focus:border-brand"
              >
                <option value="">{t("rag.noPatient")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                    {p.age != null ? ` (${t("rag.age", { age: p.age })})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span
                title={patient ? t("rag.tunedNote") : undefined}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${patient ? "bg-[#e6f2eb] text-brand" : "bg-slate-100 text-slate-500"}`}
              >
                {patient ? t("rag.tuned") : t("rag.general")}
              </span>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  title={t("chat.new")}
                  aria-label={t("chat.new")}
                  className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {messages.length === 0 && !busy && <p className="m-auto max-w-sm text-center text-sm text-slate-400">{t("rag.empty")}</p>}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">{m.content}</p>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start gap-1.5">
                  <div
                    className={`max-w-[90%] rounded-2xl rounded-bl-md border px-4 py-3 text-sm text-slate-800 ${i === sourcesOf ? "border-brand/30 bg-[#f3faf6]" : "border-slate-200 bg-slate-50"}`}
                  >
                    <AnswerWithCitations text={m.content} onCite={(n) => cite(i, n)} />
                  </div>
                  {m.sources && m.sources.length > 0 && i !== sourcesOf && (
                    <button type="button" onClick={() => setShown(i)} className="px-1 text-xs font-semibold text-brand hover:underline">
                      {t("chat.sources")} ({m.sources.length})
                    </button>
                  )}
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                {t("chat.thinking")}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-teal py-3 pl-3 pr-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <CircleQuestionMark size={16} className="shrink-0 text-brand-teal" />
              <p className="text-[13px] font-medium text-slate-700">{t("rag.escalation")}</p>
            </div>
            <Link
              href={patient ? `/doctor/patients/${patient.id}?tab=notes` : "/doctor/help"}
              className="shrink-0 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {t("rag.consult")}
            </Link>
          </div>

          <form onSubmit={send} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 py-3 pl-4 pr-3 focus-within:border-brand">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("rag.placeholder")}
              aria-label={t("rag.placeholder")}
              maxLength={2000}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label={t("chat.send")}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:opacity-90 disabled:opacity-40"
            >
              <ArrowRight size={16} />
            </button>
          </form>
        </section>

        <aside className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-base font-bold text-slate-900">{t("rag.sources")}</p>
          {sources && sources.length > 0 ? (
            <div className="scroll-slim flex max-h-[460px] flex-col gap-3 overflow-y-auto">
              {sources.map((s) => (
                <SourceCard key={s.index} s={s} active={cited === s.index} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">{t("rag.sourcesEmpty")}</p>
          )}
          <div className="flex flex-col gap-2">
            <hr className="border-slate-200" />
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
              <span className="text-brand">{t("rag.education")}</span>
              <TriangleAlert size={14} className="shrink-0 text-status-prediabetes" />
              <span className="text-right text-status-prediabetes">{t("rag.individual")}</span>
            </div>
            <hr className="border-slate-200" />
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-status-critical bg-[#fef2f2] p-3">
            <p className="text-xs font-bold text-status-critical">{t("rag.warnTitle")}</p>
            <p className="text-[11px] leading-[1.4] text-slate-700">{t("rag.warnText")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
