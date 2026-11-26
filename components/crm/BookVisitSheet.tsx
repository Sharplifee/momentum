/* Book visit sheet for a lead — day chips from availability + fixed 2-hour windows. */
"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/crm/Sheet";

type Day = { date: string; slots_remaining: number; crew_id: number };

export function BookVisitButton({ leadId, zoneId, requestedDays, requestedWindow }: {
  leadId: string; zoneId: number | null; requestedDays?: string[] | null; requestedWindow?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mo-primary h-11 rounded-full px-4 text-[13px] font-semibold">Book visit</button>
      {open && <BookVisitSheet leadId={leadId} zoneId={zoneId} requestedDays={requestedDays} requestedWindow={requestedWindow} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BookVisitSheet({ leadId, zoneId, requestedDays, requestedWindow, onClose }: {
  leadId: string; zoneId: number | null; requestedDays?: string[] | null; requestedWindow?: string | null; onClose: () => void;
}) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [windows, setWindows] = useState<string[]>(["12–2 PM", "2–4 PM", "4–6 PM", "6–8 PM"]);
  const [err, setErr] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selWin, setSelWin] = useState<string | null>(requestedWindow ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setErr(null); setDays(null);
    fetch(`/api/crm/availability?zone=${zoneId ?? ""}&count=10`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      setDays((j.days as Day[]) ?? []);
      if (j.days?.[0]?.date) setSelDay(j.days[0].date);
    }).catch(() => setErr("Couldn't load availability."));
    // load visit windows from config
    fetch("/api/crm/settings").then((r) => r.json()).then((cfg) => {
      const w = (cfg?.quote_visit_windows?.windows ?? cfg?.quote_visit_windows ?? null) as string[] | null;
      if (alive && Array.isArray(w) && w.length) setWindows(w);
    }).catch(() => null);
    return () => { alive = false; };
  }, [zoneId]);

  async function submit() {
    if (!selDay) { setErr("Pick a day"); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/crm/quote-visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, date: selDay, window: selWin }) });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Couldn't book the visit — try again.");
      return;
    }
    onClose();
    // Let the page refresh pick up the new stage; no optimistic write to keep logic server-authoritative.
    window.location.reload();
  }

  return (
    <Sheet open={true} title="Book quote visit" onClose={onClose} footer={
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex h-11 flex-1 items-center justify-center rounded-full border border-[color:var(--border-strong)] text-[13px] font-semibold text-[color:var(--ink)]">Cancel</button>
        <button type="button" onClick={submit} disabled={busy || !selDay} className="mo-primary h-11 min-w-[140px] rounded-full px-4 text-[13px] font-semibold disabled:opacity-50">{busy ? "Booking…" : "Book"}</button>
      </div>
    }>
      <div className="space-y-4">
        <div>
          <div className="mo-eyebrow mb-2">Day · from availability</div>
          {!days ? <div className="mo-skeleton h-9 w-full" /> : (
            <div className="flex flex-wrap gap-1.5">
              {days.map((d) => (
                <button key={d.date} type="button" onClick={() => setSelDay(d.date)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${selDay === d.date ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)] hover:text-[color:var(--ink)]"}`}>
                  {new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {requestedDays?.includes(new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })) && <span className="mo-eyebrow ml-2 text-teal">Asked</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mo-eyebrow mb-2">2-hour window</div>
          <div className="flex flex-wrap gap-1.5">
            {windows.map((w) => (
              <button key={w} type="button" onClick={() => setSelWin(w)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${selWin === w ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)] hover:text-[color:var(--ink)]"}`}>{w}</button>
            ))}
          </div>
        </div>
        {err && <div className="rounded-lg border border-coral/50 px-3.5 py-2 text-[12.5px] text-coral">{err}</div>}
      </div>
    </Sheet>
  );
}
