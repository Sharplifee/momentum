"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Lead = {
  id: string;
  has_dog: boolean | null;
  gate_width_in: number | null;
  obstacles: string[] | null;
  watering_day: string | null;
  bags_clippings: boolean | null;
  premium_handling: boolean | null;
  haul_clippings: boolean | null;
};

const OBSTACLE_OPTIONS = ["trampoline", "hoses", "toys"];
const WATERING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Personal-quote checklist — captured on site, in person, per HARD RULE 6.
 * These flags carry over to the property (and into pricing modifiers) the moment
 * the lead closes won.
 */
export function QuoteChecklist({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [state, setState] = useState<Lead>(lead);
  const [saving, setSaving] = useState(false);

  async function save(patch: Partial<Lead>) {
    const next = { ...state, ...patch };
    setState(next);
    setSaving(true);
    await fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checklist", lead_id: lead.id, checklist: patch }),
    });
    setSaving(false);
    router.refresh();
  }

  function toggleObstacle(o: string) {
    const cur = state.obstacles ?? [];
    const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    save({ obstacles: next });
  }

  return (
    <div className="mo-card p-4">
      <h2 className="mb-2 font-semibold">Personal-quote checklist {saving && <span className="text-xs font-normal text-slate">saving…</span>}</h2>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(state.has_dog)} onChange={(e) => save({ has_dog: e.target.checked })} /> Dog on property
        </label>
        <label className="flex items-center gap-1.5">
          Gate width
          <input type="number" min={0} className="w-16 rounded border border-[color:var(--border)] px-1.5 py-0.5"
            defaultValue={state.gate_width_in ?? ""} onBlur={(e) => save({ gate_width_in: e.target.value ? Number(e.target.value) : null })} /> in
        </label>
        <label className="flex items-center gap-1.5">
          Waters
          <select className="rounded border border-[color:var(--border)] px-1.5 py-0.5" value={state.watering_day ?? ""} onChange={(e) => save({ watering_day: e.target.value || null })}>
            <option value="">—</option>
            {WATERING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(state.bags_clippings)} onChange={(e) => save({ bags_clippings: e.target.checked })} /> Bags clippings (+$)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(state.premium_handling)} onChange={(e) => save({ premium_handling: e.target.checked })} /> Premium handling (+$)
        </label>
        <label className="flex items-center gap-1.5" title="Refused by default — needs staff override in pricing config">
          <input type="checkbox" checked={Boolean(state.haul_clippings)} onChange={(e) => save({ haul_clippings: e.target.checked })} /> Haul clippings (refused by default)
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <span className="text-slate">Obstacles:</span>
        {OBSTACLE_OPTIONS.map((o) => (
          <label key={o} className="flex items-center gap-1">
            <input type="checkbox" checked={(state.obstacles ?? []).includes(o)} onChange={() => toggleObstacle(o)} /> {o}
          </label>
        ))}
      </div>
    </div>
  );
}
