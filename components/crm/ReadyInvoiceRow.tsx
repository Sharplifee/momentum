"use client";

import { useState } from "react";

export function ReadyInvoiceRow({ job }: { job: { id: string; customer_id: string; date: string; service: string; price: number | null } }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function createAndText() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/crm/money", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        send: true,
        customer_id: job.customer_id,
        job_id: job.id,
        due_days: 7,
        line_items: [{ service: job.service ?? "Visit", price: Number(job.price ?? 0), job_id: job.id, date: job.date }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Sent." : j.error ?? "That didn't go through.");
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={createAndText} disabled={busy} className="rounded-full border border-teal/50 px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink)] disabled:opacity-50">
        {busy ? "Sending…" : "Create & text"}
      </button>
      {msg && <span className={`text-[12px] ${msg === "Sent." ? "text-sage" : "text-coral"}`}>{msg}</span>}
    </div>
  );
}
