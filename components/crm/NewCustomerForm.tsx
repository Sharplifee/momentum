"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Segmented, ToggleRow, INPUT } from "./Sheet";

type Zone = { id: number; cities: string[] };
type Plan = "weekly" | "biweekly" | "one_off";
const DAYS: { value: string; label: string }[] = [{ value: "1", label: "M" }, { value: "2", label: "T" }, { value: "3", label: "W" }, { value: "4", label: "T" }, { value: "5", label: "F" }];

/**
 * The handshake deal. Name, mobile, address, the plan and price you agreed,
 * and whether to text them a welcome. Won leads never come through here —
 * closing a quote already makes the customer.
 */
export function NewCustomerForm({ zones, defaultPrices, smsPaused = null }: { zones: Zone[]; defaultPrices: Record<string, number | null>; smsPaused?: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [plan, setPlan] = useState<Plan>("weekly");
  const [day, setDay] = useState("2");
  const [price, setPrice] = useState<string>(defaultPrices.weekly != null ? String(defaultPrices.weekly) : "");
  const [priceTouched, setPriceTouched] = useState(false);
  const [welcome, setWelcome] = useState(!smsPaused);
  const [notesNext, setNotesNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupe, setDupe] = useState<string | null>(null);

  // Zone from the city or the address text — the same match the server makes.
  const zone = useMemo(() => {
    const hay = `${city} ${address}`.toLowerCase();
    let hit: number | null = null;
    for (const z of zones) for (const c of z.cities) if (hay.includes(c.toLowerCase()) && (hit == null || z.id < hit)) hit = z.id;
    return hit;
  }, [city, address, zones]);

  function pickPlan(p: Plan) {
    setPlan(p);
    if (!priceTouched && p !== "one_off") setPrice(defaultPrices[p] != null ? String(defaultPrices[p]) : "");
  }

  const recurring = plan !== "one_off";
  const canSave = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 10 && address.trim().length >= 4 && (!recurring || Number(price) > 0) && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr(null); setDupe(null);
    const res = await fetch("/api/crm/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create", full_name: name, phone, email: email || undefined, address, city: city || undefined,
        plan, day_of_week: recurring ? Number(day) : undefined, price_per_visit: recurring ? Number(price) : undefined, welcome_text: welcome,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Couldn't save — try again."); if (res.status === 409 && j.customer_id) setDupe(j.customer_id); return; }
    router.push(notesNext ? `/crm/customers/${j.customer_id}/property` : `/crm/customers/${j.customer_id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <nav className="mo-eyebrow flex items-center gap-1.5">
          <Link href="/crm/customers" className="transition hover:text-[color:var(--ink)]">‹ Customers</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span>New</span>
        </nav>
        <button onClick={save} disabled={!canSave} className="mo-primary rounded-full px-5 py-2 text-[14px] font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
      </div>

      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">New customer</h1>
      <p className="mb-5 text-[14px] text-[color:var(--body)]">Won leads land here on their own. This is for the handshake deals.</p>

      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Erik & Dana Bergstrom" className={INPUT} autoFocus /></Field>
      <div className="grid grid-cols-[1.2fr_1fr] gap-3">
        <Field label="Mobile"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(801) 555-0000" className={INPUT} /></Field>
        <Field label="Email · optional"><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="For invoices" className={INPUT} /></Field>
      </div>
      <Field label="Service address">
        <div className="grid grid-cols-[1.6fr_1fr] gap-3">
          <div className="relative">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" className={`${INPUT} ${zone ? "pr-20" : ""}`} />
            {zone && <span className="mo-eyebrow absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-sage/50 px-2 py-0.5 text-sage">Zone {zone}</span>}
          </div>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={INPUT} />
        </div>
      </Field>
      <Field label="Plan">
        <Segmented options={[{ value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Biweekly" }, { value: "one_off", label: "One-off" }]} value={plan} onChange={pickPlan} />
      </Field>
      {recurring ? (
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Day"><Segmented options={DAYS} value={day} onChange={setDay} /></Field>
          <Field label="Per visit">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[color:var(--body)]">$</span>
              <input value={price} onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }} inputMode="decimal" className={`${INPUT} pl-8`} />
            </div>
          </Field>
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-[color:var(--body)]">One-off work gets priced on the job. Add it from the schedule with + Job once they're saved.</p>
      )}

      <ToggleRow title="Send welcome text" help={smsPaused ? `Texting is paused · ${smsPaused}` : "What to expect and how to reach us"} on={welcome} onChange={setWelcome} />
      <ToggleRow title="Property notes next" help="Gate, pets, clippings, watering days — open right after saving" on={notesNext} onChange={setNotesNext} />

      {err && (
        <p className="mt-2 text-[13px] text-coral">
          {err}{dupe && <> <Link href={`/crm/customers/${dupe}`} className="underline">Open them</Link>.</>}
        </p>
      )}
    </div>
  );
}
