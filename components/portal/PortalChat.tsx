"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: number; direction: string; sender: string; channel: string; body: string; created_at: string };

export function PortalChat({ threadId, initial, escalated }: { threadId: string; initial: Msg[]; escalated: boolean }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 10s polling (Realtime upgrade later — polling keeps anon key usage simple)
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch(`/api/portal/messages?thread_id=${threadId}`);
      if (res.ok) {
        const json = await res.json();
        setMessages(json.messages ?? []);
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [threadId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const res = await fetch("/api/portal/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, body: text }),
    });
    if (res.ok) {
      const json = await res.json();
      setMessages(json.messages ?? messages);
      setText("");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-3 max-h-[50vh] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.direction === "inbound" ? "ml-auto bg-teal text-white" : "bg-white/15"}`}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-60">
              {m.direction === "inbound" ? "You" : m.sender === "wayne" ? "Wayne (AI)" : m.sender === "staff" ? "Momentum team" : "Momentum"} · {m.channel}
            </div>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
        {!messages.length && <p className="p-4 text-sm text-white/50">Say hi — Wayne can check availability, reschedule, or price add-ons. 🌱</p>}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…"
          className="flex-1 rounded-xl border border-white/20 bg-white/10 p-3 text-sm placeholder-white/40 backdrop-blur" />
        <button onClick={send} disabled={busy || !text.trim()} className="rounded-xl bg-teal px-5 font-semibold disabled:opacity-50">{busy ? "…" : "Send"}</button>
      </div>
      {escalated && <p className="mt-2 text-xs text-white/50">A Momentum team member is handling this conversation.</p>}
    </div>
  );
}
