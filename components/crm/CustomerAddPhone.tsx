"use client";

import { useState } from "react";
import { INPUT } from "@/components/crm/Sheet";

export function CustomerAddPhone({ customerId }: { customerId: string }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  async function save() {
    setBusy(true); setErr(null); setOk(false);
    const res = await fetch("/api/crm/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contact", customer_id: customerId, phone }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "That didn't go through."); return; }
    setOk(true);
  }
  return (
    <div className="flex items-center gap-2">
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 123‑4567" inputMode="tel" className={`${INPUT} h-9 w-40 px-3 text-[13px]`} />
      <button onClick={save} disabled={busy || phone.trim().length < 10} className="rounded-full border border-teal/50 px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink)] disabled:opacity-50">
        {busy ? "Saving…" : "Add phone"}
      </button>
      {ok && <span className="mo-eyebrow text-sage">Saved</span>}
      {err && <span className="text-[12px] text-coral">{err}</span>}
    </div>
  );
}
