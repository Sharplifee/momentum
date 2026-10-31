"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Segmented, INPUT } from "./Sheet";

type Service = { id: number; name: string; slug: string };

function shortName(n: string) {
  return n.replace(/\s*lawn\s*maintenance/i, "").replace(/spring\/fall\s*/i, "").replace(/landscaping\s*/i, "").replace(/\s*care$/i, "").trim() || n;
}

/**
 * "Phone-in lead" — same fields as the website form. Posts to the public
 * intake with a staff-only source header, so Norma's opener, the team alert
 * and the pipeline stage all run exactly as they do for a website lead.
 */
export function NewLeadForm({ services }: { services: Service[] }) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState<string>(services[0]?.name ?? "");
  const [source, setSource] = useState<"phone" | "referral" | "door" | "other">("phone");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = first.trim().length > 0 && phone.replace(/\D/g, "").length >= 10 && address.trim().length >= 4 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-momentum-source": source },
      body: JSON.stringify({
        full_name: `${first.trim()} ${last.trim()}`.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim() || undefined,
        service_interest: service || undefined,
        requested_window: note.trim() || undefined,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !j.lead_id) { setErr(j.error === "invalid_phone" ? "That phone number doesn't look right." : j.error === "rate_limited" ? "Too many in a row — wait a minute." : "Couldn't save — try again."); return; }
    router.push(`/crm/leads/${j.lead_id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <nav className="mo-eyebrow flex items-center gap-1.5">
          <Link href="/crm/leads" className="transition hover:text-[color:var(--ink)]">‹ Leads</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span>New</span>
        </nav>
        <button onClick={save} disabled={!canSave} className="mo-primary rounded-full px-5 py-2 text-[14px] font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
      </div>

      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">Phone-in lead</h1>
      <p className="mb-5 text-[14px] text-[color:var(--body)]">Same fields as the website form. Norma takes over the texting once it's saved.</p>

      <div className="grid grid-cols-[1.3fr_1fr] gap-3">
        <Field label="First name"><input value={first} onChange={(e) => setFirst(e.target.value)} className={INPUT} autoFocus /></Field>
        <Field label="Last name"><input value={last} onChange={(e) => setLast(e.target.value)} className={INPUT} /></Field>
      </div>
      <Field label="Mobile · gets texts">
        <div className="relative">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(801) 555-0000" className={`${INPUT} pr-20`} />
          <span className="mo-eyebrow absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-teal/50 px-2 py-0.5 text-teal">Mobile</span>
        </div>
      </Field>
      <div className="grid grid-cols-[1.6fr_1fr] gap-3">
        <Field label="Address"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" className={INPUT} /></Field>
        <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Herriman" className={INPUT} /></Field>
      </div>
      <Field label="What do they need">
        <Segmented options={services.slice(0, 4).map((s) => ({ value: s.name, label: shortName(s.name) }))} value={service} onChange={setService} />
        {services.length > 4 && (
          <select value={service} onChange={(e) => setService(e.target.value)} className={`${INPUT} mt-2`}>
            {services.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        )}
      </Field>
      <Field label="Source">
        <Segmented options={[{ value: "phone", label: "Phone" }, { value: "referral", label: "Referral" }, { value: "door", label: "Door" }, { value: "other", label: "Other" }]} value={source} onChange={setSource} />
      </Field>
      <Field label="Note · optional">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Preferred days, corner lot, who referred them…" className={`${INPUT} resize-none`} />
      </Field>
      {err && <p className="text-[13px] text-coral">{err}</p>}
    </div>
  );
}
