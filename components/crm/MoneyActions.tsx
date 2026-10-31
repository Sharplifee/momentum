"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Segmented, INPUT } from "./Sheet";

type Invoice = { id: string; status: string; total: number; phone: string | null; firstName: string; threadId: string | null };
type Method = "cash" | "check" | "venmo" | "other";

const chevron = <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[color:var(--faint)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>;

/**
 * What you can do to an invoice from its sheet: text the customer, record a
 * payment taken outside the link, resend the link, void it. Every confirm is
 * inline — nothing pops a browser dialog.
 */
export function MoneyActions({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"" | "pay" | "void">("");
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null);
    const res = await fetch("/api/crm/money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invoice_id: invoice.id, ...extra }) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    setMsg({ text: res.ok ? (j.message ?? "Done.") : (j.error ?? "That didn't work."), ok: res.ok });
    if (res.ok) { setPanel(""); router.refresh(); }
  }

  const closed = invoice.status === "paid" || invoice.status === "void";
  const total = `$${invoice.total.toFixed(invoice.total % 1 ? 2 : 0)}`;
  const item = "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]";

  return (
    <>
      <div className="mo-card mb-3 p-0">
        <Link href={invoice.threadId ? `/crm/messages?thread=${invoice.threadId}` : "/crm/messages"} className={item}>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-[color:var(--ink)]">Text {invoice.firstName}</span>
            <span className="block text-[12px] text-[color:var(--body)]">{invoice.threadId ? "Opens their thread" : "Opens Norma's inbox"}</span>
          </span>
          {chevron}
        </Link>
        {!closed && (
          <>
            <button type="button" onClick={() => setPanel(panel === "pay" ? "" : "pay")} className={`${item} border-t border-[color:var(--border)]`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-[color:var(--ink)]">Record a payment</span>
                <span className="block text-[12px] text-[color:var(--body)]">Cash, check, or Venmo taken outside the link</span>
              </span>
              {chevron}
            </button>
            {panel === "pay" && (
              <div className="border-t border-[color:var(--border)] px-4 py-3">
                <div className="mo-eyebrow mb-1.5">How they paid</div>
                <Segmented options={[{ value: "cash", label: "Cash" }, { value: "check", label: "Check" }, { value: "venmo", label: "Venmo" }, { value: "other", label: "Other" }]} value={method} onChange={setMethod} />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note · optional" className={`${INPUT} mt-2`} />
                <button type="button" disabled={!!busy} onClick={() => act("mark_paid", { method, note })} className="mo-primary mt-2 w-full rounded-full py-3 text-[14px] font-semibold disabled:opacity-40">
                  {busy === "mark_paid" ? "Saving…" : `Mark paid · ${total}`}
                </button>
              </div>
            )}
            <button type="button" onClick={() => setPanel(panel === "void" ? "" : "void")} className={`${item} border-t border-[color:var(--border)]`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-[color:var(--ink)]">Void this invoice</span>
                <span className="block text-[12px] text-[color:var(--body)]">Keeps the record, takes it off the books</span>
              </span>
              {chevron}
            </button>
            {panel === "void" && (
              <div className="border-t border-[color:var(--border)] px-4 py-3">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why — one line" className={INPUT} autoFocus />
                <button type="button" disabled={!!busy || reason.trim().length < 2} onClick={() => act("void", { reason: reason.trim() })} className="mt-2 w-full rounded-full border border-coral/60 py-3 text-[14px] font-semibold text-coral disabled:opacity-40">
                  {busy === "void" ? "Voiding…" : "Void it"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {msg && <p className={`mb-3 text-center text-[13px] ${msg.ok ? "text-sage" : "text-coral"}`}>{msg.text}</p>}

      {!closed && (
        <div className="fixed inset-x-0 z-30 flex gap-2 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:px-0 md:py-0"
          style={{ bottom: "calc(62px + env(safe-area-inset-bottom))" }}>
          <button type="button" disabled={!!busy || !invoice.phone} onClick={() => act("send")} className="flex-1 rounded-full border border-teal/50 py-3.5 text-[15px] font-semibold text-[color:var(--ink)] disabled:opacity-40">
            {busy === "send" ? "Sending…" : invoice.status === "draft" ? "Send link" : "Resend link"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setPanel("pay")} className="mo-primary flex-[1.4] rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40">
            Mark paid · {total}
          </button>
        </div>
      )}
    </>
  );
}
