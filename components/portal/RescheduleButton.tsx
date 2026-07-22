"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RescheduleButton({ jobId, date }: { jobId: string; date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/portal/reschedule", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, requested_date: newDate }),
    });
    const json = await res.json();
    setMsg(json.message ?? (res.ok ? "Done!" : json.error ?? "Something went wrong"));
    setBusy(false);
    if (res.ok) { router.refresh(); setTimeout(() => setOpen(false), 2500); }
  }

  return (
    <div className="text-right">
      <button onClick={() => setOpen(!open)} className="rounded-xl bg-teal/80 px-3 py-2 text-xs font-semibold">Reschedule</button>
      {open && (
        <div className="mt-2 rounded-xl bg-navy/80 p-3 text-left">
          <input type="date" value={newDate} min={new Date(Date.now() + 86400_000).toISOString().slice(0, 10)} onChange={(e) => setNewDate(e.target.value)}
            className="mb-2 w-full rounded-lg border border-white/20 bg-white/10 p-2 text-sm" />
          <button onClick={submit} disabled={!newDate || busy} className="w-full rounded-lg bg-teal p-2 text-xs font-semibold disabled:opacity-50">
            {busy ? "Working…" : "Request this day"}
          </button>
          {msg && <p className="mt-2 text-xs text-white/70">{msg}</p>}
        </div>
      )}
    </div>
  );
}
