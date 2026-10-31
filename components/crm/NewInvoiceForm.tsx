"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Segmented, ToggleRow, INPUT } from "./Sheet";

type Hit = { type: string; id: string; label: string; sub: string };
type Visit = { id: string; date: string; status: string; price: number | null; service: string; crew: string | null };
type Line = { service: string; price: string; job_id?: string | null; date?: string | null };

const DUE = [{ value: "0", label: "On receipt" }, { value: "7", label: "Net 7" }, { value: "14", label: "Net 14" }, { value: "30", label: "Net 30" }];
const mdy = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A hand-written invoice. Visits bill themselves; this is for the extra haul,
 * the one-off cleanup, the thing you agreed on the driveway. Lines, a due
 * date, and whether to text the pay link right now.
 */
export function NewInvoiceForm({ taxRate, taxLabel, netDays, initialCustomer, smsPaused = null }: { taxRate: number; taxLabel: string; netDays: number; initialCustomer: Hit | null; smsPaused?: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [customer, setCustomer] = useState<Hit | null>(initialCustomer);
  const [phone, setPhone] = useState<string | null>(initialCustomer?.sub ?? null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitId, setVisitId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ service: "", price: "" }]);
  const [due, setDue] = useState(String([0, 7, 14, 30].includes(netDays) ? netDays : 7));
  const [send, setSend] = useState(!smsPaused);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (customer || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/crm/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).catch(() => ({ hits: [] }));
      setHits((r.hits ?? []).filter((h: Hit) => h.type === "customer").slice(0, 6));
    }, 200);
    return () => clearTimeout(t);
  }, [q, customer]);

  useEffect(() => {
    if (!customer) { setVisits([]); setVisitId(""); setPhone(null); return; }
    fetch(`/api/crm/customers?customer_id=${customer.id}`).then((r) => r.json()).then((d) => {
      setVisits(d.jobs ?? []);
      setPhone(d.customer?.phone ?? null);
    }).catch(() => null);
  }, [customer]);

  function attach(id: string) {
    setVisitId(id);
    const v = visits.find((x) => x.id === id);
    // A visit's line starts from what the job was priced at; blank if it never was.
    setLines((ls) => {
      const rest = ls.filter((l) => !l.job_id && (l.service || l.price));
      return v ? [{ service: v.service, price: v.price != null ? String(v.price) : "", job_id: v.id, date: v.date }, ...rest] : rest.length ? rest : [{ service: "", price: "" }];
    });
  }
  const setLine = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : [{ service: "", price: "" }]));

  const valid = lines.filter((l) => l.service.trim() && Number(l.price) > 0);
  const subtotal = valid.reduce((s, l) => s + Number(l.price), 0);
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const canSave = Boolean(customer) && valid.length > 0 && !busy;

  async function save(sendNow: boolean) {
    if (!canSave) return;
    setBusy(sendNow ? "send" : "draft"); setErr(null);
    const res = await fetch("/api/crm/money", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create", customer_id: customer!.id, job_id: visitId || null, due_days: Number(due), send: sendNow,
        line_items: valid.map((l) => ({ service: l.service.trim(), price: Number(l.price), job_id: l.job_id ?? null, date: l.date ?? null })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok && !j.invoice_id) { setErr(j.error ?? "Couldn't save — try again."); return; }
    router.push(`/crm/accounting/invoices/${j.invoice_id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-6">
      <nav className="mo-eyebrow mb-5 flex items-center gap-1.5">
        <Link href="/crm/accounting" className="transition hover:text-[color:var(--ink)]">‹ Accounting</Link>
        <span className="text-[color:var(--faint)]">/</span>
        <span>New invoice</span>
      </nav>
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">New invoice</h1>
      <p className="mb-5 text-[14px] text-[color:var(--body)]">Visits invoice themselves on completion. This is for extras and one-offs.</p>

      <Field label="Customer">
        {customer ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[color:var(--border)] bg-black/30 px-4 py-3">
            <span className="truncate text-[15px] text-[color:var(--ink)]">{customer.label}</span>
            <button type="button" onClick={() => { setCustomer(null); setQ(""); }} className="shrink-0 text-[13px] font-semibold text-teal">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name or phone" className={INPUT} autoFocus />
            {hits.length > 0 && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[#121212] shadow-pop">
                {hits.map((h) => (
                  <button key={h.id} type="button" onClick={() => { setCustomer(h); setHits([]); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.05]">
                    <span className="text-[14px] text-[color:var(--ink)]">{h.label}</span>
                    <span className="mo-mono text-[11px] text-[color:var(--body)]">{h.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>

      <Field label="Attach to visit · optional">
        <select value={visitId} onChange={(e) => attach(e.target.value)} disabled={!customer} className={`${INPUT} disabled:opacity-50`}>
          <option value="">{customer ? (visits.length ? "No visit — standalone" : "No visits on file") : "Pick a customer first"}</option>
          {visits.map((v) => <option key={v.id} value={v.id}>{mdy(v.date)} · {v.service.toLowerCase()}{v.crew ? ` · ${v.crew}` : ""}{v.status !== "completed" ? ` · ${v.status}` : ""}</option>)}
        </select>
      </Field>

      <div className="mo-card mb-4 px-4 pb-1 pt-3.5">
        <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Lines</h2>
        {lines.map((l, idx) => (
          <div key={idx} className="flex items-center gap-2 border-t border-[color:var(--border)] py-2 first:border-t-0">
            <input value={l.service} onChange={(e) => setLine(idx, { service: e.target.value })} placeholder="Fall cleanup · leaves, beds, haul" className="min-w-0 flex-1 bg-transparent text-[14px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]" />
            <span className="text-[13px] text-[color:var(--body)]">$</span>
            <input value={l.price} onChange={(e) => setLine(idx, { price: e.target.value })} inputMode="decimal" placeholder="0" className="mo-mono w-16 bg-transparent text-right text-[14px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]" />
            <button type="button" onClick={() => removeLine(idx)} aria-label="Remove line" className="grid h-7 w-7 place-items-center rounded-full text-[color:var(--faint)] hover:text-coral">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, { service: "", price: "" }])} className="block w-full border-t border-[color:var(--border)] py-2.5 text-left text-[14px] text-teal">+ Add a line</button>
        {tax > 0 && <div className="flex items-center justify-between border-t border-[color:var(--border)] py-2 text-[13px] text-[color:var(--body)]"><span>{taxLabel} · {(taxRate * 100).toFixed(2).replace(/\.?0+$/, "")}%</span><span className="mo-mono">{fmt(tax)}</span></div>}
        <div className="flex items-center justify-between border-t border-[color:var(--border-strong)] py-2.5">
          <span className="mo-eyebrow">Total</span>
          <span className="mo-num text-[18px] text-[color:var(--ink)]">{fmt(total)}</span>
        </div>
      </div>

      <Field label="Due"><Segmented options={DUE} value={due} onChange={setDue} /></Field>

      <ToggleRow title="Send by text with pay link" help={smsPaused ? `Texting is paused · ${smsPaused}` : phone ? `To ${phone} · past-due reminders go automatically` : customer ? "No mobile on file — save as a draft" : "Pick a customer first"} on={send && Boolean(phone)} onChange={(v) => setSend(v)} />

      {err && <p className="mb-3 text-[13px] text-coral">{err}</p>}

      <div className="fixed inset-x-0 z-30 flex gap-2 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:px-0 md:py-0"
        style={{ bottom: "calc(62px + env(safe-area-inset-bottom))" }}>
        <button type="button" disabled={!canSave} onClick={() => save(false)} className="flex-1 rounded-full border border-teal/50 py-3.5 text-[15px] font-semibold text-[color:var(--ink)] disabled:opacity-40">{busy === "draft" ? "Saving…" : "Save draft"}</button>
        <button type="button" disabled={!canSave || !send || !phone} onClick={() => save(true)} className="mo-primary flex-[1.4] rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40">{busy === "send" ? "Sending…" : `Send · ${total ? fmt(total).replace(/\.00$/, "") : "$0"}`}</button>
      </div>
    </div>
  );
}
