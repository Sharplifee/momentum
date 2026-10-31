"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtStamp } from "@/lib/leadTimeline";

export type ServiceRow = { id: number; name: string; slug: string; base_price: number | null; unit: string | null };
export type QuoteRow = { id: string; line_items: any; total: number; status: string; created_at: string; sent_at: string | null };

type Line = { key: string; service: string; price: string; unit: "visit" | "once"; on: boolean; custom?: boolean };

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * Line items, totals, the text the customer gets, and two ways out: save as a
 * draft or send it. Prices start at the service list and are typed on site.
 */
export function QuoteBuilder({ lead, services, quotes, staffFirst }: {
  lead: { id: string; first: string; phone: string; service_interest: string | null };
  services: ServiceRow[];
  quotes: QuoteRow[];
  staffFirst: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() => services.map((s) => ({
    key: s.slug, service: s.name, price: s.base_price != null ? String(Number(s.base_price)) : "", unit: s.unit === "visit" ? "visit" : "once",
    on: s.slug === lead.service_interest,
  })));
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState({ name: "", price: "", unit: "once" as "visit" | "once" });
  const [sendText, setSendText] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | "">("");
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const active = lines.filter((l) => l.on && l.price !== "" && Number.isFinite(Number(l.price)));
  const perVisit = active.filter((l) => l.unit === "visit").reduce((s, l) => s + Number(l.price), 0);
  const once = active.filter((l) => l.unit === "once").reduce((s, l) => s + Number(l.price), 0);
  const firstVisit = perVisit + once;

  const defaultMessage = useMemo(() => {
    if (!active.length) return "";
    const parts = active.map((l) => `${l.service} ${money(Number(l.price))}${l.unit === "visit" ? "/visit" : " one time"}`);
    const total = perVisit && once ? `That's ${money(perVisit)} per visit, ${money(firstVisit)} the first time out.`
      : perVisit ? `That's ${money(perVisit)} per visit.` : `That's ${money(once)} total.`;
    return `Hi ${lead.first}, it's ${staffFirst} with Momentum Landscaping. Your quote: ${parts.join(", ")}. ${total} Reply YES and we'll get you on the schedule — or text me any questions.`;
  }, [active.map((l) => l.key + l.price).join("|"), lead.first, staffFirst]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = message ?? defaultMessage;

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addCustom() {
    if (!custom.name.trim() || custom.price === "") return;
    setLines((ls) => [...ls, { key: `custom-${Date.now()}`, service: custom.name.trim(), price: custom.price, unit: custom.unit, on: true, custom: true }]);
    setCustom({ name: "", price: "", unit: "once" });
    setAdding(false);
  }

  async function submit(send: boolean) {
    setBusy(send ? "send" : "draft");
    setNote(null);
    const res = await fetch("/api/crm/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "quote", lead_id: lead.id, send,
        line_items: active.map((l) => ({ service: l.service, qty: 1, price: Number(l.price), unit: l.unit })),
        message: send ? text : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setNote({ tone: "bad", text: json.error ?? "That didn't go through." }); router.refresh(); return; }
    setNote({ tone: "ok", text: send ? (json.queued ? "Quote saved and the text is queued for 8 AM (quiet hours)." : "Quote sent.") : "Draft saved." });
    router.refresh();
    if (send) setTimeout(() => router.push(`/crm/leads/${lead.id}`), 900);
  }

  const canSend = active.length > 0 && (!sendText || text.trim().length > 0) && !busy;
  const kv = "flex items-center justify-between gap-3 border-t border-[color:var(--border)] py-2.5 text-[13px]";

  return (
    <>
      <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
        <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Line items</h2>
        {lines.map((l) => (
          <div key={l.key} className={kv}>
            <button type="button" onClick={() => update(l.key, { on: !l.on })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${l.on ? "border-teal bg-teal text-[#0a0a0a]" : "border-white/20"}`}>
                {l.on && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
              </span>
              <span className={`truncate ${l.on ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>{l.service}</span>
            </button>
            <span className="mo-mono flex shrink-0 items-center gap-1 text-[13px]">
              <span className={l.on ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}>$</span>
              <input value={l.price} inputMode="decimal" placeholder="—" onChange={(e) => update(l.key, { price: e.target.value.replace(/[^\d.]/g, ""), on: true })}
                className={`w-14 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-white/30 focus:bg-black/30 ${l.on ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`} />
              <button type="button" onClick={() => update(l.key, { unit: l.unit === "visit" ? "once" : "visit" })} className="text-[11px] text-[color:var(--body)]" title="Tap to switch per visit / one time">
                {l.unit === "visit" ? "/ visit" : "once"}
              </button>
            </span>
          </div>
        ))}
        {adding ? (
          <div className="border-t border-[color:var(--border)] py-2.5">
            <div className="flex gap-2">
              <input autoFocus value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Aeration, beds, …"
                className="min-w-0 flex-1 rounded-full border border-[color:var(--border)] bg-black/30 px-3.5 py-2 text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)] focus:border-white/30" />
              <input value={custom.price} inputMode="decimal" onChange={(e) => setCustom({ ...custom, price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="$"
                className="mo-mono w-20 rounded-full border border-[color:var(--border)] bg-black/30 px-3 py-2 text-right text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)] focus:border-white/30" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              {(["once", "visit"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setCustom({ ...custom, unit: u })}
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${custom.unit === u ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>{u === "once" ? "One time" : "Per visit"}</button>
              ))}
              <span className="flex-1" />
              <button type="button" onClick={() => setAdding(false)} className="text-[12.5px] text-[color:var(--body)]">Cancel</button>
              <button type="button" onClick={addCustom} className="text-[12.5px] font-semibold text-teal">Add line</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${kv} w-full text-teal`}>+ Add aeration, beds, or custom line</button>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.16] py-2.5">
          <span className="mo-eyebrow">{perVisit && once ? "Per visit · first visit" : perVisit ? "Per visit" : "One time"}</span>
          <span className="mo-num text-[18px] text-[color:var(--ink)]">
            {!active.length ? "—" : perVisit && once ? `${money(perVisit)} · ${money(firstVisit)}` : money(firstVisit)}
          </span>
        </div>
      </section>

      <section className="mo-card mb-3 p-0">
        <button type="button" onClick={() => setSendText(!sendText)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium text-[color:var(--ink)]">Send as text</span>
            <span className="block text-[11.5px] text-[color:var(--body)]">Texts the quote to {lead.phone} from the team · the thread keeps the reply</span>
          </span>
          <span className={`relative h-7 w-[46px] shrink-0 rounded-full transition ${sendText ? "bg-teal" : "bg-white/15"}`}>
            <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full transition ${sendText ? "left-[21px] bg-[#0a0a0a]" : "left-[3px] bg-[color:var(--ink)]"}`} />
          </span>
        </button>
        {sendText && (
          <div className="border-t border-[color:var(--border)] px-4 py-3">
            <textarea value={text} onChange={(e) => setMessage(e.target.value)} rows={4}
              className="w-full resize-none rounded-2xl border border-[color:var(--border)] bg-black/30 px-4 py-3 text-[14px] leading-snug text-[color:var(--ink)] outline-none focus:border-white/30" />
            {message !== null && <button type="button" onClick={() => setMessage(null)} className="mt-1 text-[12px] text-teal">Reset wording</button>}
          </div>
        )}
      </section>

      {quotes.length > 0 && (
        <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
          <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Quotes on file</h2>
          {quotes.map((q) => (
            <div key={q.id} className={kv}>
              <span className="min-w-0 truncate text-[color:var(--ink)]">
                {(Array.isArray(q.line_items) ? q.line_items : []).map((i: any) => i.service).filter(Boolean).join(", ") || "Quote"}
              </span>
              <span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">
                <span className="text-[color:var(--ink)]">{money(Number(q.total))}</span> · {q.status} · {fmtStamp(q.sent_at ?? q.created_at)}
              </span>
            </div>
          ))}
        </section>
      )}

      {note && <p className={`mb-3 text-[13px] ${note.tone === "bad" ? "text-coral" : "text-sage"}`}>{note.text}</p>}

      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:px-0">
        <button type="button" disabled={!active.length || Boolean(busy)} onClick={() => submit(false)}
          className={`flex h-12 flex-1 items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40 ${sendText ? "border border-teal/50 text-[color:var(--ink)]" : "mo-primary"}`}>
          {busy === "draft" ? "Saving…" : "Save draft"}
        </button>
        {sendText && (
          <button type="button" disabled={!canSend} onClick={() => submit(true)}
            className="mo-primary flex h-12 flex-[1.4] items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40">
            {busy === "send" ? "Sending…" : active.length ? `Send quote · ${perVisit ? `${money(perVisit)}/visit` : money(firstVisit)}` : "Send quote"}
          </button>
        )}
      </div>
    </>
  );
}
