"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ChecklistLead = {
  id: string;
  has_dog: boolean | null;
  gate_width_in: number | null;
  obstacles: string[] | null;
  watering_day: string | null;
  bags_clippings: boolean | null;
  premium_handling: boolean | null;
  haul_clippings: boolean | null;
};

const OBSTACLE_OPTIONS = ["trampoline", "hoses", "toys", "beds"];
const WATERING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How many of the six walk-through questions have an answer on file. */
export function checklistProgress(l: ChecklistLead): { done: number; total: number } {
  const answered = [l.gate_width_in != null, l.has_dog != null, l.obstacles != null, l.watering_day != null, l.bags_clippings != null, l.premium_handling != null];
  return { done: answered.filter(Boolean).length, total: answered.length };
}

/**
 * The on-site walk-through — captured in person at the quote visit, per
 * HARD RULE 6. Each row is one question; the dot fills when it has an
 * answer. Every answer carries over to the property (and into pricing
 * modifiers) the moment the lead closes won.
 */
export function QuoteChecklist({ lead, title = "Quote visit checklist", line = false }: { lead: ChecklistLead; title?: string; line?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<ChecklistLead>(lead);
  const [saving, setSaving] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const progress = checklistProgress(state);

  async function save(patch: Partial<ChecklistLead>) {
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

  const Dot = ({ ok }: { ok: boolean }) => (
    <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[11px] ${ok ? "border-sage bg-sage text-[#0a0a0a]" : "border-white/20"}`}>
      {ok && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
    </span>
  );
  const Row = ({ id, label, value, ok, children }: { id: string; label: string; value: string; ok: boolean; children: React.ReactNode }) => (
    <div className="border-t border-[color:var(--border)]">
      <button type="button" onClick={() => setOpenRow(openRow === id ? null : id)} className="flex w-full items-center gap-3 py-2.5 text-left">
        <Dot ok={ok} />
        <span className="flex-1 text-[13.5px] text-[color:var(--ink)]">{label}</span>
        <span className="mo-mono text-[11px] text-[color:var(--body)]">{value}</span>
      </button>
      {openRow === id && <div className="pb-3 pl-[30px]">{children}</div>}
    </div>
  );
  const Seg = ({ options, value, onPick }: { options: { v: string; l: string }[]; value: string | null; onPick: (v: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onPick(o.v)}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${value === o.v ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );

  const clippings = state.haul_clippings ? "bag · haul" : state.bags_clippings === true ? "bag" : state.bags_clippings === false ? "mulch" : "—";
  const obstacles = state.obstacles == null ? "—" : state.obstacles.length ? state.obstacles.join(" · ") : "clear";

  return (
    <section className={`mo-card ${line ? "aiv-glow" : ""} px-4 pb-1 pt-3.5`}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{title}</h2>
        <span className="mo-eyebrow">{saving ? "Saving…" : `${progress.done} of ${progress.total}`}</span>
      </div>

      <Row id="gate" label="Gate width" ok={state.gate_width_in != null} value={state.gate_width_in != null ? `${state.gate_width_in} in${state.gate_width_in >= 36 ? " · mower fits" : " · too narrow"}` : "—"}>
        <div className="flex items-center gap-2">
          <input type="number" min={0} inputMode="numeric" defaultValue={state.gate_width_in ?? ""} placeholder="inches"
            onBlur={(e) => save({ gate_width_in: e.target.value ? Number(e.target.value) : null })}
            className="w-28 rounded-full border border-[color:var(--border)] bg-black/30 px-3.5 py-2 text-[14px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)] focus:border-white/30" />
          <span className="text-[12px] text-[color:var(--body)]">in · 36 in clears the mower</span>
        </div>
      </Row>

      <Row id="dog" label="Pets / access" ok={state.has_dog != null} value={state.has_dog == null ? "—" : state.has_dog ? "dog on property" : "no dog"}>
        <Seg options={[{ v: "yes", l: "Dog on property" }, { v: "no", l: "No dog" }]} value={state.has_dog == null ? null : state.has_dog ? "yes" : "no"} onPick={(v) => save({ has_dog: v === "yes" })} />
      </Row>

      <Row id="obstacles" label="Slope / obstacles" ok={state.obstacles != null} value={obstacles}>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => save({ obstacles: [] })}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${state.obstacles && !state.obstacles.length ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>Clear</button>
          {OBSTACLE_OPTIONS.map((o) => {
            const on = (state.obstacles ?? []).includes(o);
            return (
              <button key={o} type="button" onClick={() => save({ obstacles: on ? (state.obstacles ?? []).filter((x) => x !== o) : [...(state.obstacles ?? []), o] })}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold capitalize transition ${on ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>{o}</button>
            );
          })}
        </div>
      </Row>

      <Row id="water" label="Sprinkler timing" ok={state.watering_day != null} value={state.watering_day ? `waters ${state.watering_day}` : "—"}>
        <Seg options={WATERING_DAYS.map((d) => ({ v: d, l: d }))} value={state.watering_day} onPick={(v) => save({ watering_day: v })} />
      </Row>

      <Row id="clip" label="Clippings" ok={state.bags_clippings != null} value={clippings}>
        <Seg options={[{ v: "mulch", l: "Mulch" }, { v: "bag", l: "Bag (+$)" }, { v: "haul", l: "Bag · haul (+$)" }]}
          value={state.haul_clippings ? "haul" : state.bags_clippings === true ? "bag" : state.bags_clippings === false ? "mulch" : null}
          onPick={(v) => save({ bags_clippings: v !== "mulch", haul_clippings: v === "haul" })} />
        <p className="mt-1.5 text-[11.5px] text-[color:var(--body)]">Hauling is refused by default — needs a pricing override.</p>
      </Row>

      <Row id="premium" label="Premium handling" ok={state.premium_handling != null} value={state.premium_handling == null ? "—" : state.premium_handling ? "yes (+$)" : "standard"}>
        <Seg options={[{ v: "no", l: "Standard" }, { v: "yes", l: "Premium (+$)" }]} value={state.premium_handling == null ? null : state.premium_handling ? "yes" : "no"} onPick={(v) => save({ premium_handling: v === "yes" })} />
      </Row>
    </section>
  );
}
