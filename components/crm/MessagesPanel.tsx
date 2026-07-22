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
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl bg-white p-2 shadow-sm lg:max-h-[70vh] lg:overflow-y-auto dark:bg-stone-900">
        {threads.map((t: any) => (
          <Link key={t.id} href={`/crm/messages?thread=${t.id}`}
            className={`block rounded-lg p-2 text-sm ${t.id === activeThread?.id ? "bg-moss text-white" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}>
            <div className="font-medium">{t.leads?.full_name ?? t.customers?.full_name ?? t.phone}{t.escalated && " 🙋"}</div>
            <div className="text-xs opacity-70">{t.phone}</div>
          </Link>
        ))}
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2 dark:bg-stone-900">
        {activeThread ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{activeThread.phone}</span>
              <button onClick={toggleTakeover} className={`rounded-full px-3 py-1 text-xs ${activeThread.escalated ? "bg-red-100 text-red-700 dark:bg-red-950" : "bg-stone-100 dark:bg-stone-800"}`}>
                {activeThread.escalated ? "Human has thread — hand back to Wayne" : "Take over from Wayne"}
              </button>
            </div>
            <div className="mb-3 max-h-[45vh] space-y-2 overflow-y-auto">
              {messages.map((m: any) => (
                <div key={m.id} className={`max-w-[80%] rounded-xl p-2 text-sm ${m.direction === "inbound" ? "bg-stone-100 dark:bg-stone-800" : "ml-auto bg-moss text-white"}`}>
                  <div className="text-xs opacity-60">{m.sender} · {new Date(m.created_at).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  {m.body}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
                className="flex-1 rounded-lg border border-stone-300 p-2 text-sm dark:border-stone-700 dark:bg-stone-800" />
              <button onClick={send} disabled={busy || !text} className="rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
            </div>
          </>
        ) : <p className="text-stone-400">No thread selected.</p>}
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
          <button onClick={() => setShowTemplates(!showTemplates)} className="text-sm underline">Template library ({templates.length})</button>
          {showTemplates && (
            <div className="mt-2 space-y-1 text-xs">
              {templates.map((t: any) => (
                <div key={t.id} className="rounded bg-stone-50 p-2 dark:bg-stone-800">
                  <strong>{t.name}</strong>{t.delay_minutes != null && ` · +${t.delay_minutes}m`} {!t.active && "· inactive"}
                  <button onClick={() => setText(t.body)} className="ml-2 underline">use</button>
                  <div className="text-stone-500">{t.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
