"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = ["new", "contacted", "quote_sent", "closed_won", "not_qualified", "stale"];

export function LeadActions({ lead, services, quotes }: {
  lead: { id: string; stage: string; phone: string; thread_id: string | null };
  services: { name: string; slug: string; base_price: number | null }[];
  quotes: { id: string; line_items: any; total: number; status: string }[];
}) {
  const router = useRouter();
  const [sms, setSms] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setNote(json.error ?? "failed"); else setNote("");
    router.refresh();
    return res.ok;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h3 className="mb-2 text-sm font-semibold">Stage</h3>
        <div className="flex flex-wrap gap-1">
          {STAGES.map((s) => (
            <button key={s} disabled={busy === s || s === lead.stage}
              onClick={async () => { setBusy(s); await post("/api/crm/stage", { lead_id: lead.id, stage: s }); setBusy(""); }}
              className={`rounded-full px-3 py-1 text-xs ${s === lead.stage ? "bg-moss text-white" : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800"}`}>
              {busy === s ? "…" : s}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h3 className="mb-2 text-sm font-semibold">Quick SMS</h3>
        <textarea value={sms} onChange={(e) => setSms(e.target.value)} rows={3} placeholder="Message…"
          className="mb-2 w-full rounded-lg border border-stone-300 p-2 text-sm dark:border-stone-700 dark:bg-stone-800" />
        <button disabled={!sms || busy === "sms"}
          onClick={async () => { setBusy("sms"); const ok = await post("/api/crm/sms", { to: lead.phone, message: sms, thread_id: lead.thread_id }); if (ok) setSms(""); setBusy(""); }}
          className="rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h3 className="mb-2 text-sm font-semibold">Quote builder</h3>
        {services.filter((s) => s.base_price != null).map((s) => (
          <label key={s.slug} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(s.slug)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, s.slug] : selected.filter((x) => x !== s.slug))} />
            {s.name} (${s.base_price})
          </label>
        ))}
        <button disabled={!selected.length || busy === "quote"}
          onClick={async () => { setBusy("quote"); await post("/api/crm/leads", { action: "quote", lead_id: lead.id, service_slugs: selected }); setSelected([]); setBusy(""); }}
          className="mt-2 rounded-lg bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create quote</button>
        {quotes.length > 0 && (
          <div className="mt-3 space-y-1 text-xs text-stone-500">
            {quotes.map((q) => <div key={q.id}>${q.total} · {q.status}</div>)}
          </div>
        )}
      </div>
      {note && <p className="text-sm text-red-600 md:col-span-3">{note}</p>}
    </div>
  );
}
