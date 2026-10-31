"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deliveryState, fmtClock, fmtDayLabel, fmtStamp, denverDay, fmtPhone, type MsgMeta } from "@/lib/leadTimeline";

export type ThreadRow = {
  id: string; phone: string; escalated: boolean; last_message_at: string | null;
  name: string; preview: string | null; previewAt: string | null;
};
export type ActiveThread = {
  id: string; phone: string; escalated: boolean; name: string;
  address: string | null; tag: string | null; personHref: string | null; handedAt: string | null;
};
export type Msg = { id: number; direction: string; sender: string | null; body: string; meta: MsgMeta; created_at: string };
export type Draft = { phone: string; lead_id: string | null; name: string };
type Template = { id: number; name: string; body: string; active: boolean | null };

const initials = (n: string) => (n.match(/\b\w/g) ?? ["?"]).slice(0, 2).join("").toUpperCase();

/**
 * Norma's conversations. On a phone the list and the thread are two screens
 * (the thread opens full-screen with a back link); on a desktop they sit
 * side by side. Sending goes through /api/crm/sms as the team.
 */
export function MessagesPanel({ threads, active, messages, templates, draft, firstName }: {
  threads: ThreadRow[]; active: ActiveThread | null; messages: Msg[]; templates: Template[]; draft: Draft | null; firstName: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTpl, setShowTpl] = useState(false);
  const [confirmHandoff, setConfirmHandoff] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const threadOpen = Boolean(active || draft);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [active?.id, messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr(null);
    let threadId = active?.id ?? null;
    const phone = active?.phone ?? draft?.phone;
    if (!threadId && draft) {
      const r = await fetch("/api/crm/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", phone: draft.phone, lead_id: draft.lead_id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Couldn't open the thread."); setBusy(false); return; }
      threadId = j.thread_id;
    }
    const res = await fetch("/api/crm/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: phone, message: body, thread_id: threadId }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? (json.reason ? `Not sent · ${String(json.reason).replace(/_/g, " ")}` : "Not sent.")); return; }
    if (json.reason === "queued_quiet_hours") setErr("Quiet hours — queued for 8 AM.");
    setText("");
    if (!active && threadId) router.push(`/crm/messages?thread=${threadId}`); else router.refresh();
  }

  async function setEscalated(v: boolean) {
    if (!active) return;
    await fetch("/api/crm/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread_id: active.id, escalated: v }) });
    setConfirmHandoff(false);
    router.refresh();
  }

  const quick = "flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] text-[color:var(--ink)]";

  return (
    <div className="lg:grid lg:min-h-[70vh] lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-4">
      {/* ===== list ===== */}
      <section className={`${threadOpen ? "hidden lg:block" : ""} mo-card self-start p-0`}>
        <div className="flex items-center justify-between px-3.5 pb-1.5 pt-3">
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Conversations</span>
          <span className="mo-eyebrow">Test threads hidden</span>
        </div>
        {!threads.length && <p className="px-3.5 pb-4 pt-2 text-[13px] text-[color:var(--body)]">No conversations yet — the first text in starts one.</p>}
        {threads.map((t) => {
          const on = t.id === active?.id;
          return (
            <Link key={t.id} href={`/crm/messages?thread=${t.id}`}
              className={`flex items-center gap-3 border-t border-[color:var(--border)] px-3.5 py-3 transition hover:bg-white/[0.03] ${t.escalated ? "border-l-2 border-l-gold" : ""} ${on ? "bg-white/[0.04]" : ""}`}>
              <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border border-white/10 text-[12px] font-semibold text-[color:var(--ink)]">{initials(t.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-[color:var(--ink)]">{t.name}</span>
                  {t.escalated
                    ? <span className="mo-mono shrink-0 text-[11px] text-gold">Handed to you</span>
                    : t.previewAt && <span className="mo-mono shrink-0 text-[11px] text-[color:var(--body)]">{fmtStamp(t.previewAt)}</span>}
                </span>
                <span className={`mt-0.5 block truncate text-[12.5px] ${t.escalated ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>{t.preview ?? fmtPhone(t.phone)}</span>
              </span>
            </Link>
          );
        })}
      </section>

      {/* ===== thread ===== */}
      <section className={`${threadOpen ? "flex" : "hidden lg:flex"} min-h-[60vh] flex-col lg:min-h-0 lg:rounded-[10px] lg:border lg:border-[color:var(--border)] lg:bg-[#121212]`}>
        {!threadOpen ? (
          <div className="m-auto p-10 text-center text-[13px] text-[color:var(--body)]">Pick a conversation.</div>
        ) : (
          <>
            {/* header */}
            <div className="-mx-4 flex items-center gap-1.5 border-b border-[color:var(--border)] px-2 pb-2.5 lg:mx-0 lg:px-3 lg:pt-3">
              <Link href="/crm/messages" aria-label="Back to Norma" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[color:var(--body)] lg:hidden">
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              </Link>
              <div className="min-w-0 flex-1 pl-1 lg:pl-1">
                <div className="truncate font-display text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{active?.name ?? draft?.name}</div>
                <div className={`mo-mono text-[10.5px] uppercase tracking-[0.08em] ${active?.escalated ? "text-gold" : "text-teal"}`}>
                  {!active ? "New thread · first text" : active.escalated ? `Handed to you${active.handedAt ? ` · ${fmtStamp(active.handedAt)}` : ""}` : messages.length ? `Norma on it · ${fmtStamp(messages[messages.length - 1].created_at)}` : "Norma on it"}
                </div>
              </div>
              {active?.personHref && (
                <Link href={active.personHref} aria-label="Open record" className="grid h-10 w-10 place-items-center rounded-full text-[color:var(--body)] hover:text-[color:var(--ink)]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></svg>
                </Link>
              )}
              <a href={`tel:${active?.phone ?? draft?.phone}`} aria-label="Call" className="grid h-10 w-10 place-items-center rounded-full text-[color:var(--body)] hover:text-[color:var(--ink)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
              </a>
            </div>
            {(active?.address || active?.tag || draft) && (
              <div className="flex items-center gap-2 pt-2 lg:px-3.5">
                <span className="mo-eyebrow truncate">{active?.address ?? fmtPhone(draft?.phone ?? "")}</span>
                <span className="flex-1" />
                {active?.tag && <span className="mo-eyebrow shrink-0 text-teal">{active.tag}</span>}
              </div>
            )}

            {/* messages */}
            <div className="flex flex-1 flex-col gap-2.5 py-3.5 lg:max-h-[55vh] lg:overflow-y-auto lg:px-3.5">
              {!messages.length && <p className="self-center py-6 text-[12px] text-[color:var(--body)]">{draft ? "Nothing sent yet — your text below starts the thread." : "No messages on this thread yet."}</p>}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || denverDay(prev.created_at) !== denverDay(m.created_at);
                const inbound = m.direction === "inbound";
                const staff = m.sender === "staff";
                const st = inbound ? null : deliveryState(m.meta);
                return (
                  <div key={m.id} className="contents">
                    {newDay && <div className="self-center py-0.5 text-[11px] text-[color:var(--body)]">{fmtDayLabel(m.created_at)}</div>}
                    <div className={`max-w-[78%] rounded-[14px] px-3.5 py-2.5 text-[14px] leading-[1.4] ${
                      inbound ? "self-start rounded-bl-[4px] border border-[color:var(--border)] bg-[#121212] text-[color:var(--ink)]"
                        : staff ? "self-end rounded-br-[4px] border border-teal/35 bg-[#0e0e0e] text-[color:var(--ink)]"
                        : "self-end rounded-br-[4px] bg-[color:var(--ink)] text-[#0a0a0a]"}`}>
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`mo-mono mt-1 text-[10px] ${inbound ? "text-[color:var(--body)]" : staff ? "text-right text-teal" : "text-right text-[#0a0a0a]/55"}`}>
                        {inbound ? fmtClock(m.created_at) : `${m.sender === "nora" ? "Norma" : staff ? "Team" : "System"} · ${fmtClock(m.created_at)}`}
                        {st && <span className={st.tone === "bad" ? " text-coral" : ""}> · {st.label}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {active?.escalated && (
                <div className="flex items-start gap-2.5 rounded-[10px] border border-gold/50 px-3 py-2.5">
                  <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <div className="text-[12.5px] leading-[1.45] text-[color:var(--body)]">
                    <span className="font-semibold text-[color:var(--ink)]">Norma handed this to you.</span> She has paused replies on this thread until a person answers.
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* suggested (templates) */}
            {showTpl && (
              <div className="mo-card mb-2 p-0 lg:mx-3.5">
                <div className="mo-eyebrow px-3.5 pb-1.5 pt-2.5">Ready-made messages</div>
                {templates.filter((t) => t.active !== false).map((t) => {
                  const filled = t.body.replace(/\{first_name\}/g, (active?.name ?? draft?.name ?? "").split(" ")[0] || "there").replace(/\{staff\}/g, firstName);
                  return (
                    <button key={t.id} type="button" onClick={() => { setText(filled); setShowTpl(false); }} className="flex w-full items-center gap-3 border-t border-[color:var(--border)] px-3.5 py-2.5 text-left">
                      <span className="flex-1 text-[13px] leading-[1.4] text-[color:var(--ink)]">{filled}</span>
                      <span className="mo-eyebrow shrink-0 rounded-full border border-teal/50 px-2 py-0.5 text-[9px] text-teal">Use</span>
                    </button>
                  );
                })}
                {!templates.length && <p className="px-3.5 pb-3 text-[12px] text-[color:var(--body)]">No templates saved.</p>}
              </div>
            )}

            {/* quick actions */}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] lg:mx-0 lg:px-3.5 [&::-webkit-scrollbar]:hidden">
              <a href={`tel:${active?.phone ?? draft?.phone}`} className={`${quick} border-white/[0.12]`}>Call now</a>
              <button type="button" onClick={() => setShowTpl(!showTpl)} className={`${quick} border-white/[0.12]`}>{showTpl ? "Hide messages" : "Ready-made"}</button>
              {active && !active.escalated && (
                <button type="button" onClick={() => setEscalated(true)} className={`${quick} border-teal/50`}>Take over</button>
              )}
              {active?.escalated && !confirmHandoff && (
                <button type="button" onClick={() => setConfirmHandoff(true)} className={`${quick} border-teal/50`}>Hand back to Norma</button>
              )}
              {active?.escalated && confirmHandoff && (
                <>
                  <button type="button" onClick={() => setEscalated(false)} className={`${quick} border-sage/60 text-sage`}>Yes, Norma resumes</button>
                  <button type="button" onClick={() => setConfirmHandoff(false)} className={`${quick} border-white/[0.12]`}>Keep it</button>
                </>
              )}
            </div>
            {active?.escalated && (
              <div className="flex items-center gap-2.5 py-1.5 lg:px-3.5">
                <div className="mo-hairline-soft flex-1" />
                <span className="mo-eyebrow text-[9px] text-gold">Norma stepped back · you&apos;re replying as {firstName}</span>
                <div className="mo-hairline-soft flex-1" />
              </div>
            )}

            {/* composer */}
            <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 -mx-4 bg-[color:var(--bg)]/95 px-4 pb-2 pt-2 backdrop-blur md:bottom-0 lg:static lg:mx-0 lg:bg-transparent lg:px-3.5 lg:pb-3.5">
              {err && <p className={`mb-1.5 text-[12px] ${err.startsWith("Quiet") ? "text-gold" : "text-coral"}`}>{err}</p>}
              <div className="flex items-end gap-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Reply as Momentum…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                  className="max-h-32 min-h-[46px] flex-1 resize-none rounded-[23px] border border-white/[0.12] bg-[#0e0e0e] px-4 py-3 text-[15px] leading-snug text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)] focus:border-white/30" />
                <button type="button" onClick={send} disabled={busy || !text.trim()} aria-label="Send"
                  className="mo-primary grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full disabled:opacity-40">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
