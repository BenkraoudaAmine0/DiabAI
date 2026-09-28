"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

interface Source {
  index: number;
  title: string;
  excerpt: string;
  similarity: number;
}

interface ChatResponse {
  session_id: string;
  answer: string;
  sources: Source[];
}

/** Renders [1]-style citations in the answer as clickable chips. */
function AnswerWithCitations({ text }: { text: string }) {
  const { t } = useI18n();
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <a
            key={i}
            href={`#src-${m[1]}`}
            title={t("chat.sources")}
            className="mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 align-middle text-[11px] font-bold text-teal-700 no-underline hover:bg-teal-200"
          >
            {m[1]}
          </a>
        );
      })}
    </p>
  );
}

export default function ChatPage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setMessages((m) => [
      ...m,
      { role: "user", content: message, created_at: new Date().toISOString() },
    ]);
    try {
      const res = await api<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          sources: res.sources,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("chat.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("chat.subtitle")}</p>
      </div>

      <div className="scroll-slim flex-1 space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5">
        {messages.length === 0 && !busy && (
          <p className="mt-16 text-center text-sm text-slate-400">
            {t("chat.empty")}
          </p>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl rounded-br-md bg-teal-600 px-4 py-2.5 text-sm text-white">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-800">
                <AnswerWithCitations text={m.content} />
              </div>
              {m.sources && m.sources.length > 0 && (
                <details className="max-w-[90%] text-xs">
                  <summary className="cursor-pointer font-semibold text-teal-600">
                    {t("chat.sources")} ({m.sources.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {m.sources.map((s) => (
                      <li
                        key={s.index}
                        id={`src-${s.index}`}
                        className="rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <p className="font-semibold text-slate-700">
                          [{s.index}] {s.title}
                          <span className="ml-2 font-normal text-slate-400">
                            {(s.similarity * 100).toFixed(0)}%
                          </span>
                        </p>
                        <p className="mt-1 text-slate-500">{s.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            {t("chat.thinking")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat.placeholder")}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {t("chat.send")}
        </button>
      </form>
      <p className="text-center text-xs text-slate-400">
        {t("chat.disclaimer")}
      </p>
    </div>
  );
}
