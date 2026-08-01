"use client";

import { useState } from "react";

export function PropertyForm({ property }: { property: { id: string; address: string; city: string | null; gate_code: string | null; pets: string | null; access_notes: string | null } }) {
  const [gate, setGate] = useState(property.gate_code ?? "");
  const [pets, setPets] = useState(property.pets ?? "");
  const [notes, setNotes] = useState(property.access_notes ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/portal/property", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: property.id, gate_code: gate, pets, access_notes: notes }),
    });
    setMsg(res.ok ? "Saved — the crew will see this next visit." : "Save failed, try again.");
    setBusy(false);
  }

  return (
    <div className="mb-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
      <p className="mb-3 font-semibold">{property.address}{property.city ? `, ${property.city}` : ""}</p>
      <label className="mb-2 block text-sm text-white/60">Gate code
        <input value={gate} onChange={(e) => setGate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 p-2 text-white" />
      </label>
      <label className="mb-2 block text-sm text-white/60">Pets
        <input value={pets} onChange={(e) => setPets(e.target.value)} placeholder="e.g. friendly dog in back yard" className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 p-2 text-white" />
      </label>
      <label className="mb-3 block text-sm text-white/60">Access notes / special requests
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 p-2 text-white" />
      </label>
      <button onClick={save} disabled={busy} className="rounded-xl bg-teal px-5 py-2 text-sm font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      {msg && <p className="mt-2 text-xs text-white/60">{msg}</p>}
    </div>
  );
}
