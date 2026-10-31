"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Segmented, INPUT } from "./Sheet";

export type PropertyNotes = {
  id: string; customer_id: string; address: string; city: string | null;
  gate_code: string | null; gate_width_in: number | null; access_notes: string | null;
  pets: string | null; has_dog: boolean; lot_notes: string | null; obstacles: string[] | null;
  watering_day: string | null; bags_clippings: boolean; haul_clippings: boolean;
};

const PET_FRIENDLY = "Dog · friendly";
const PET_GATE = "Dog · keep gate shut";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

type Pets = "none" | "friendly" | "gate" | "other";
type Clip = "mulch" | "haul" | "leave";

/**
 * What the crew needs at the curb, and nothing else. Saves to the property
 * the stop cards and the job sheet already read from.
 */
export function PropertyNotesForm({ property, customerName }: { property: PropertyNotes; customerName: string }) {
  const router = useRouter();
  const p = property;
  const initialPets: Pets = !p.has_dog && !p.pets ? "none" : p.pets === PET_FRIENDLY ? "friendly" : p.pets === PET_GATE ? "gate" : p.pets ? "other" : "friendly";
  const [gateCode, setGateCode] = useState(p.gate_code ?? "");
  const [gateWidth, setGateWidth] = useState(p.gate_width_in != null ? String(p.gate_width_in) : "");
  const [access, setAccess] = useState(p.access_notes ?? "");
  const [pets, setPets] = useState<Pets>(initialPets);
  const [petsOther, setPetsOther] = useState(initialPets === "other" ? p.pets ?? "" : "");
  const [clip, setClip] = useState<Clip>(p.haul_clippings ? "haul" : p.bags_clippings ? "leave" : "mulch");
  const [days, setDays] = useState<Set<string>>(new Set(DAYS.filter((d) => (p.watering_day ?? "").toLowerCase().includes(d.toLowerCase()))));
  const [obstacles, setObstacles] = useState((p.obstacles ?? []).join(", "));
  const [note, setNote] = useState(p.lot_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(d: string) {
    setDays((prev) => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  }

  async function save() {
    setBusy(true); setErr(null);
    const petsValue = pets === "none" ? null : pets === "friendly" ? PET_FRIENDLY : pets === "gate" ? PET_GATE : petsOther.trim() || null;
    const res = await fetch("/api/crm/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "property", property_id: p.id, customer_id: p.customer_id,
        patch: {
          gate_code: gateCode, gate_width_in: gateWidth, access_notes: access,
          pets: petsValue, has_dog: pets !== "none",
          bags_clippings: clip !== "mulch", haul_clippings: clip === "haul",
          watering_day: DAYS.filter((d) => days.has(d)).join(" · ") || null,
          obstacles: obstacles.split(",").map((s) => s.trim()).filter(Boolean),
          lot_notes: note,
        },
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Couldn't save — try again."); return; }
    router.push(`/crm/customers/${p.customer_id}`);
    router.refresh();
  }

  const petOptions: { value: Pets; label: string }[] = [{ value: "none", label: "None" }, { value: "friendly", label: PET_FRIENDLY }, { value: "gate", label: PET_GATE }];
  if (initialPets === "other") petOptions.push({ value: "other", label: "Other" });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <nav className="mo-eyebrow flex min-w-0 items-center gap-1.5">
          <Link href="/crm/customers" className="shrink-0 transition hover:text-[color:var(--ink)]">‹ Customers</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <Link href={`/crm/customers/${p.customer_id}`} className="truncate transition hover:text-[color:var(--ink)]">{customerName}</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span className="shrink-0">Property</span>
        </nav>
        <button onClick={save} disabled={busy} className="mo-primary shrink-0 rounded-full px-5 py-2 text-[14px] font-semibold disabled:opacity-40">{busy ? "Saving…" : "Done"}</button>
      </div>

      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">Property notes</h1>
      <p className="mb-1 text-[14px] text-[color:var(--body)]">Shows on the crew&apos;s stop card every visit. Keep it to what they need at the curb.</p>
      <p className="mb-5 text-[12px] text-[color:var(--faint)]">{p.address}{p.city ? `, ${p.city}` : ""}</p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Gate code"><input value={gateCode} onChange={(e) => setGateCode(e.target.value)} inputMode="numeric" className={INPUT} /></Field>
        <Field label="Gate width">
          <div className="relative">
            <input value={gateWidth} onChange={(e) => setGateWidth(e.target.value)} inputMode="numeric" className={`${INPUT} pr-10`} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[color:var(--body)]">in</span>
          </div>
        </Field>
      </div>
      <Field label="Access"><input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Side yard, left of garage" className={INPUT} /></Field>
      <Field label="Pets">
        <Segmented options={petOptions} value={pets} onChange={setPets} />
        {pets === "other" && <input value={petsOther} onChange={(e) => setPetsOther(e.target.value)} className={`${INPUT} mt-2`} />}
      </Field>
      <Field label="Clippings">
        <Segmented options={[{ value: "mulch", label: "Mulch" }, { value: "haul", label: "Bag · haul" }, { value: "leave", label: "Bag · leave" }]} value={clip} onChange={setClip} />
      </Field>
      <Field label="Watering days · skip the morning after">
        <div className="flex rounded-full border border-[color:var(--border)] bg-black/30 p-1">
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={days.has(d)} aria-label={d}
              className={`min-w-0 flex-1 rounded-full py-2 text-[13px] font-semibold transition ${days.has(d) ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"}`}>{DAY_LETTER[i]}</button>
          ))}
        </div>
      </Field>
      <Field label="Obstacles · comma separated"><input value={obstacles} onChange={(e) => setObstacles(e.target.value)} placeholder="Trampoline, sprinkler heads" className={INPUT} /></Field>
      <Field label="Crew note">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Skip the back slope if it rained the night before — it tears up." className={`${INPUT} resize-none`} />
      </Field>
      {err && <p className="text-[13px] text-coral">{err}</p>}
    </div>
  );
}
