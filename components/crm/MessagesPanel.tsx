"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function MessagesPanel({ threads, activeThread, messages, templates }: any) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  async function send() {
    if (!activeThread || !text) return;
    setBusy(true);
    await fetch("/api/crm/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: activeThread.phone, message: text, thread_id: activeThread.id }) });
    setText(""); setBusy(false); router.refresh();
  }
  async function toggleTakeover() {
    if (!activeThread) return;
    await fetch("/api/crm/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread_id: activeThread.id, escalated: !activeThread.escalated }) });
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:h-[72vh]">
      <div className="mo-card p-2 lg:overflow-y-auto">
        {threads.map((t: any) => (
          <Link key={t.id} href={`/crm/messages?thread=${t.id}`}
            className={`flex items-center gap-2.5 rounded-xl p-2 text-sm transition ${t.id === activeThread?.id ? "bg-teal text-white" : "hover:bg-white/[0.05]"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${t.id === activeThread?.id ? "bg-white/25 text-white" : "bg-teal/15 text-teal"}`}>
              {((t.leads?.full_name ?? t.customers?.full_name ?? "?").match(/\b\w/g) ?? ["?"]).slice(0,2).join("").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.leads?.full_name ?? t.customers?.full_name ?? t.phone}{t.escalated ? " · You" : ""}</span>
              <span className="block truncate text-xs opacity-70">{t.phone}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mo-card p-4 lg:col-span-2 ">
        {activeThread ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{activeThread.phone}</span>
              <button onClick={toggleTakeover} className={`rounded-full px-3 py-1 text-xs ${activeThread.escalated ? "bg-red/15 text-red" : "bg-ice/15 dark:bg-white/10"}`}>
                {activeThread.escalated ? "Human has thread — hand back to Wayne" : "Take over from Wayne"}
              </button>
            </div>
            <div className="mb-3 max-h-[45vh] space-y-2 overflow-y-auto">
              {messages.map((m: any) => (
                <div key={m.id} className={`max-w-[76%] ${m.direction === "inbound" ? "" : "ml-auto"}`}>
                  <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.direction === "inbound" ? "rounded-bl-md bg-white/[0.08] text-[color:var(--ink)]" : "rounded-br-md bg-teal text-white"}`}>{m.body}</div>
                  <div className={`mt-0.5 text-[10px] text-[color:var(--body)]/70 ${m.direction === "inbound" ? "" : "text-right"}`}>{m.sender === "wayne" ? "Wayne" : m.sender} · {new Date(m.created_at).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
                className="h-10 flex-1 rounded-full border border-[color:var(--border)] bg-white/[0.06] px-4 text-sm outline-none focus:border-teal dark:bg-white/10" />
              <button onClick={send} disabled={busy || !text} className="h-10 rounded-full bg-teal px-5 text-sm font-semibold text-white transition hover:bg-teal-deep disabled:opacity-50">Send</button>
            </div>
          </>
        ) : <p className="text-slate/70">No thread selected.</p>}
        <div className="mt-4 border-t border-[color:var(--border)] pt-3">
          <button onClick={() => setShowTemplates(!showTemplates)} className="text-sm underline">Template library ({templates.length})</button>
          {showTemplates && (
            <div className="mt-2 space-y-1 text-xs">
              {templates.map((t: any) => (
                <div key={t.id} className="rounded bg-ice/10 p-2 dark:bg-white/10">
                  <strong>{t.name}</strong>{t.delay_minutes != null && ` · +${t.delay_minutes}m`} {!t.active && "· inactive"}
                  <button onClick={() => setText(t.body)} className="ml-2 underline">use</button>
                  <div className="text-slate">{t.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
