"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT } from "@/components/crm/Sheet";

const fmt = (p: string) => { const d = p.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1"); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

/**
 * The account's number and email, editable in place. Shows "No phone on file"
 * — never a made-up value — for the clients restored from the original book
 * until someone types the real number in.
 */
export function CustomerContact({ customerId, phone, email }: { customerId: string; phone: string | null; email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(phone ? fmt(phone) : "");
  const [e, setE] = useState(email ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = { action: "contact", customer_id: customerId };
    if (p.trim() !== (phone ? fmt(phone) : "")) body.phone = p.trim();
    if (e.trim() !== (email ?? "")) body.email = e.trim();
    if (Object.keys(body).length === 2) { setOpen(false); setBusy(false); return; }
    const r = await fetch("/api/crm/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Could not save."); return; }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mo-eyebrow flex items-center gap-1.5 text-right">
        {phone ? <span className="text-[color:var(--ink)]">{fmt(phone)}</span> : <span className="text-gold">No phone on file</span>}
        {email ? <span> · {email}</span> : null}
        <span className="text-teal">{phone ? " · edit" : " · add"}</span>
      </button>
    );
  }
  return (
    <div className="mt-2 w-full space-y-2">
      <input className={INPUT} inputMode="tel" autoFocus placeholder="Mobile number" value={p} onChange={(ev) => setP(ev.target.value)} />
      <input className={INPUT} inputMode="email" placeholder="Email (optional)" value={e} onChange={(ev) => setE(ev.target.value)} />
      {err && <div className="text-[12.5px] text-coral">{err}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="mo-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setErr(null); setP(phone ? fmt(phone) : ""); setE(email ?? ""); }} className="rounded-full border border-[color:var(--border)] px-4 py-2.5 text-[14px] text-[color:var(--body)]">Cancel</button>
      </div>
    </div>
  );
}
