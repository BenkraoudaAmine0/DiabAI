"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, CircleQuestionMark, Library, SendHorizontal, Stethoscope } from "lucide-react";

import ConsultDoctorDialog from "@/components/patient/ConsultDoctorDialog";
import { LangToggle, useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { readFriendly } from "@/lib/patient";
import type { ChatMessage, ChatSource } from "@/lib/types";

interface ChatResponse {
  session_id: string;
  answer: string;
  sources: ChatSource[];
}

function cleanLatex(raw: string): string {
  return raw
    .replace(/\$(?:\\ge|\\geq)\$|\\(?:ge|geq)\b/g, "≥")
    .replace(/\$(?:\\le|\\leq)\$|\\(?:le|leq)\b/g, "≤")
    .replace(/\$\\beta\$|\\beta\b/g, "β")
    .replace(/\$\\alpha\$|\\alpha\b/g, "α")
    .replace(/\$\\gamma\$|\\gamma\b/g, "γ")
    .replace(/\$\\delta\$|\\delta\b/g, "δ")
    .replace(/\$\\pm\$|\\pm\b/g, "±")
    .replace(/\$\\times\$|\\times\b/g, "×")
    .replace(/\$\\approx\$|\\approx\b/g, "≈")
    .replace(/\$\\neq\$|\\neq\b/g, "≠")
    .replace(/\$\\mu\$|\\mu\b/g, "µ")
    .replace(/\$(?:\\rightarrow|\\to)\$|\\(?:rightarrow|to)\b/g, "→")
    .replace(/\$\\leftarrow\$|\\leftarrow\b/g, "←")
    .replace(/\$([0-9a-zA-Z\s.,/%+-]+)\$/g, "$1");
}

/** [1]-style citations as small chips (Figma chat palette). */
function Cited({ text }: { text: string }) {
  const cleaned = cleanLatex(text);
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-[22px] text-[#17352d]">
      {cleaned.split(/(\[\d+\])/g).map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        return m ? (
          <a
            key={i}
            href={`#pt-src-${m[1]}`}
            className="mx-0.5 inline-flex size-5 items-center justify-center rounded-full bg-[#e4f5ee] align-middle text-[11px] font-bold text-[#126847] no-underline"
          >
            {m[1]}
          </a>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </p>
  );
}

function TypewriterCited({
  text,
  animate,
  onDone,
  onScroll,
}: {
  text: string;
  animate: boolean;
  onDone?: () => void;
  onScroll?: () => void;
}) {
  const [displayedLength, setDisplayedLength] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      setDisplayedLength(text.length);
      return;
    }

    setDisplayedLength(0);
    let current = 0;
    let ticks = 0;
    const step = Math.max(1, Math.ceil(text.length / 90));
    const interval = setInterval(() => {
      current += step;
      ticks++;
      if (current >= text.length) {
        setDisplayedLength(text.length);
        clearInterval(interval);
        onDone?.();
        onScroll?.();
      } else {
        setDisplayedLength(current);
        if (ticks % 3 === 0) onScroll?.();
      }
    }, 20);

    return () => clearInterval(interval);
  }, [text, animate]);

  const displayedText = text.slice(0, displayedLength);
  const isTyping = animate && displayedLength < text.length;

  return (
    <>
      <Cited text={displayedText} />
      {isTyping && (
        <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-[#1d8a63] align-middle" />
      )}
    </>
  );
}

/** Figma 06 Patient Screens · AI Chat (122:16804). Same /api/chat as the
 *  clinician chat, plus the Settings "Friendly explanations" flag. */
export default function PatientChat() {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typingIndex, setTypingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consultOpen, setConsultOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: message, created_at: new Date().toISOString() }]);
    try {
      const res = await api<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message, session_id: sessionId, lang, friendly: readFriendly() }),
      });
      setSessionId(res.session_id);
      setMessages((m) => {
        const next = [
          ...m,
          { role: "assistant" as const, content: res.answer, sources: res.sources, created_at: new Date().toISOString() },
        ];
        setTypingIndex(next.length - 1);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const lastSources = [...messages].reverse().find((m) => m.role === "assistant")?.sources ?? [];

  return (
    <div className="flex h-[calc(100dvh-128px)] min-h-[560px] flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#dde9e4] bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[28px] font-bold text-[#17352d]">{t("pt.chat.title")}</h1>
          <p className="text-sm text-[#879993]">{t("pt.chat.subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 rounded-full bg-[#e4f5ee] px-[9px] py-[5px] text-[11px] font-semibold text-[#126847]">
            <BookOpen size={14} />
            {t("pt.chat.badge")}
          </span>
          <LangToggle />
        </div>
      </div>

      {/* chat area */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-3xl border border-[#dde9e4] bg-white p-4">
        <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {messages.length === 0 && !busy && (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma assistant mark */}
              <img src="/brand/assistant-mark.svg" alt="" className="size-10" />
              <p className="text-sm text-[#879993]">{t("pt.chat.empty")}</p>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[400px] rounded-[16px_4px_16px_16px] bg-[#1d8a63] px-5 py-4 text-[15px] leading-[22px] text-white">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- Figma assistant mark */}
                <img src="/brand/assistant-mark.svg" alt="" className="size-10 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-[#dde9e4] bg-white p-6 shadow-[0_4px_7px_rgba(21,63,48,0.06)]">
                  <TypewriterCited
                    text={m.content}
                    animate={typingIndex === i}
                    onDone={() => setTypingIndex(null)}
                    onScroll={() => bottomRef.current?.scrollIntoView({ behavior: "auto" })}
                  />
                  <button
                    type="button"
                    onClick={() => setConsultOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d8a63] px-4 text-[13px] font-semibold text-white hover:opacity-90"
                  >
                    <Stethoscope size={17} />
                    {t("pt.chat.consult")}
                  </button>
                </div>
              </div>
            )
          )}

          {busy && (
            <div className="flex items-center gap-3 text-sm text-[#879993]">
              <span className="size-4 animate-spin rounded-full border-2 border-[#1d8a63] border-t-transparent" />
              {t("pt.chat.thinking")}
            </div>
          )}

          {lastSources.length > 0 && !busy && (
            <div className="flex flex-col gap-4 pt-2">
              <p className="text-base font-bold text-[#17352d]">{t("pt.chat.sources")}</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {lastSources.map((s) => (
                  <div
                    key={s.index}
                    id={`pt-src-${s.index}`}
                    className="flex flex-col gap-3 rounded-xl border border-[#dde9e4] bg-[#f7faf9] p-5"
                  >
                    <Library size={14} className="text-[#879993]" />
                    <p className="text-[13px] leading-[18px] text-[#879993]">
                      [{s.index}] {s.title}
                      {s.page ? ` · ${t("pt.chat.page", { n: s.page })}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

        <form
          onSubmit={send}
          className="-mx-4 -mb-4 flex items-center gap-2 border-t border-[#dde9e4] bg-white py-3 pl-4 pr-3 shadow-[0_-4px_18px_rgba(21,63,48,0.08)]"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("pt.chat.placeholder")}
            aria-label={t("pt.chat.placeholder")}
            className="h-12 min-w-0 flex-1 rounded-xl border border-[#c8dad3] bg-[#f7faf9] px-3.5 text-sm text-[#17352d] outline-none placeholder:text-[#879993] focus:border-[#1d8a63]"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t("pt.chat.send")}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#1d8a63] text-white hover:opacity-90 disabled:opacity-40"
          >
            <SendHorizontal size={20} />
          </button>
        </form>
      </div>

      <p className="flex h-[54px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e4f5ee] px-4 text-[13px] font-semibold text-[#126847]">
        <CircleQuestionMark size={18} />
        {t("pt.chat.banner")}
      </p>

      {consultOpen && <ConsultDoctorDialog onClose={() => setConsultOpen(false)} />}
    </div>
  );
}
