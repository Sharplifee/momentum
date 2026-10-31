"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Field, Segmented } from "./Sheet";

export type LeadFilterState = { stage?: string; needs?: string; zone?: string; source?: string; sort?: string; q?: string };

const STAGE_OPTS = [
  ["new", "New"], ["contacted", "Contacted"], ["quote_sent", "Quoted"], ["closed_won", "Won"], ["not_qualified", "Lost"], ["stale", "Stale"],
] as const;

/**
 * Filter sheet for the pipeline — stage, who it needs, zone, source, sort.
 * Everything lands in the URL so a filtered view can be shared and survives
 * refresh; Reset clears it all.
 */
export function LeadFilterButton({ current, counts, zones }: {
  current: LeadFilterState; counts: Record<string, number>; zones: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<LeadFilterState>(current);
  const [moreZones, setMoreZones] = useState(false);
  const activeCount = ["stage", "needs", "zone", "source"].filter((k) => (current as any)[k]).length;

  function apply(next: LeadFilterState) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    router.push(`/crm/leads${p.toString() ? `?${p}` : ""}`);
    setOpen(false);
  }
  const chip = (on: boolean) => `mo-eyebrow rounded-full border px-3 py-2 transition ${on ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`;
  const shownZones = moreZones ? zones : zones.slice(0, 5);

  return (
    <>
      <button onClick={() => { setSt(current); setOpen(true); }} aria-label="Filter leads"
        className={`relative grid h-10 w-10 place-items-center rounded-full border transition ${activeCount ? "border-teal text-teal" : "border-teal/50 text-[color:var(--ink)]"}`}>
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        {activeCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-teal px-1 text-[9px] font-bold text-[#0a0a0a]">{activeCount}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filter"
        footer={
          <div className="flex gap-3">
            <button onClick={() => apply({ q: st.q })} className="flex-[0.6] rounded-full border border-[color:var(--border-strong)] py-3.5 text-[15px] font-semibold text-[color:var(--ink)]">Reset</button>
            <button onClick={() => apply(st)} className="mo-primary flex-1 rounded-full py-3.5 text-[15px] font-semibold">Show leads</button>
          </div>
        }>
        <Field label="Stage">
          <div className="flex flex-wrap gap-2">
            {STAGE_OPTS.map(([k, label]) => (
              <button key={k} onClick={() => setSt({ ...st, stage: st.stage === k ? undefined : k })} className={chip(st.stage === k)}>
                {label} · {counts[k] ?? 0}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Needs">
          <Segmented options={[{ value: "", label: "Anyone" }, { value: "human", label: "A human" }, { value: "untouched", label: "Untouched 24h" }]} value={st.needs ?? ""} onChange={(v) => setSt({ ...st, needs: v || undefined })} />
        </Field>
        <Field label="Zone">
          <div className="flex flex-wrap gap-2">
            {shownZones.map((z) => (
              <button key={z.id} onClick={() => setSt({ ...st, zone: st.zone === String(z.id) ? undefined : String(z.id) })} className={chip(st.zone === String(z.id))}>{z.name}</button>
            ))}
            {!moreZones && zones.length > 5 && <button onClick={() => setMoreZones(true)} className={chip(false)}>+ {zones.length - 5} more</button>}
          </div>
        </Field>
        <Field label="Source">
          <Segmented options={[{ value: "", label: "All" }, { value: "website", label: "Website" }, { value: "meta_lead_ad", label: "Meta ad" }, { value: "phone", label: "Phone" }]} value={st.source ?? ""} onChange={(v) => setSt({ ...st, source: v || undefined })} />
        </Field>
        <Field label="Sort">
          <Segmented options={[{ value: "", label: "Newest" }, { value: "untouched", label: "Oldest untouched" }, { value: "value", label: "Value" }]} value={st.sort ?? ""} onChange={(v) => setSt({ ...st, sort: v || undefined })} />
        </Field>
      </Sheet>
    </>
  );
}
