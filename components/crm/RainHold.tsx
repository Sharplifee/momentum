"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToggleRow } from "./Sheet";

export type HoldStop = { id: string; name: string; service: string; recurring: boolean; flagged: boolean; crew: string | null; proposed: string | null };

/**
 * Rain hold — the owner confirms which stops move. Mowing moves; one-off work
 * (cleanups, aeration) is kept by default because wet grass doesn't stop it.
 * Nothing moves until the button is pressed.
 */
export function RainHold({ date, dateLabel, stops, crewName }: { date: string; dateLabel: string; stops: HoldStop[]; crewName: string | null }) {
  const router = useRouter();
  const [keep, setKeep] = useState<Set<string>>(new Set(stops.filter((s) => !s.recurring).map((s) => s.id)));
  const [textCustomers, setTextCustomers] = useState(true);
  const [tellCrew, setTellCrew] = useState(true);
  const [busy, setBusy] = useState<"hold" | "run" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const moving = stops.filter((s) => !keep.has(s.id));
  const dayName = (iso: string | null) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) : "—";

  async function post(body: unknown) {
    setErr(null);
    const res = await fetch("/api/crm/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setErr("Didn't go through — try again."); return false; }
    return true;
  }

  return (
    <>
      <section className="mo-card mb-3 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Affected stops · {stops.length}</span>
          {crewName && <span className="mo-eyebrow">{crewName}&apos;s route</span>}
        </div>
        {stops.map((s) => {
          const kept = keep.has(s.id);
          return (
            <button key={s.id} type="button" onClick={() => { const n = new Set(keep); kept ? n.delete(s.id) : n.add(s.id); setKeep(n); }}
              className="flex w-full items-center gap-3 border-t border-[color:var(--border)] px-4 py-3 text-left">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] ${kept ? "border-gold text-gold" : "border-sage bg-sage/15 text-sage"}`}>{kept ? "!" : "✓"}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] text-[color:var(--ink)]">{s.name} · {s.service.toLowerCase()}</span>
              <span className={`mo-mono shrink-0 text-[12px] ${kept ? "text-gold" : "text-[color:var(--body)]"}`}>{kept ? "keep" : `→ ${dayName(s.proposed)}`}</span>
            </button>
          );
        })}
        {!stops.length && <div className="border-t border-[color:var(--border)] px-4 py-6 text-center text-sm text-[color:var(--body)]">Nothing scheduled that day.</div>}
      </section>

      <ToggleRow title="Text affected customers" help="Norma sends the rain-hold wording with the new day" on={textCustomers} onChange={setTextCustomers} />
      <ToggleRow title={crewName ? `Tell ${crewName}` : "Tell the crew"} help={`SMS · "${dateLabel} is a rain day, new route posted"`} on={tellCrew} onChange={setTellCrew} />

      <p className="mb-4 mt-1 text-[13px] leading-snug text-[color:var(--body)]">
        {moving.length ? `${moving.length} stop${moving.length === 1 ? "" : "s"} roll to the next day with room on the route. ` : "Nothing is set to move. "}Nothing moves until you confirm.
      </p>
      {err && <p className="mb-2 text-[13px] text-coral">{err}</p>}

      <div className="flex gap-3 pb-6">
        <button disabled={busy !== null} onClick={async () => { setBusy("run"); if (await post({ action: "run_anyway", date })) router.push("/crm/schedule"); setBusy(null); }}
          className="flex-[0.8] rounded-full border border-teal/50 py-3.5 text-[15px] font-semibold text-[color:var(--ink)] disabled:opacity-50">
          {busy === "run" ? "…" : "Run anyway"}
        </button>
        <button disabled={busy !== null || !moving.length}
          onClick={async () => { setBusy("hold"); if (await post({ action: "hold_day", date, job_ids: moving.map((m) => m.id), text_customers: textCustomers, notify_crew: tellCrew, reason: "rain hold" })) router.push(`/crm/schedule?m=${date.slice(0, 7)}&d=${date}`); setBusy(null); }}
          className="mo-primary flex-1 rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40">
          {busy === "hold" ? "Moving…" : `Hold ${dateLabel.split(",")[0]} · move ${moving.length}`}
        </button>
      </div>
    </>
  );
}
