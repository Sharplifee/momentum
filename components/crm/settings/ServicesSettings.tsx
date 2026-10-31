"use client";

import { useState } from "react";
import { Sheet, Field, Segmented, INPUT } from "@/components/crm/Sheet";
import { Button } from "@/components/ui";
import { Dot, Row, RowCard } from "@/components/crm/settings/ui";
import { Switch, useSettingsSave, SaveStatus } from "@/components/crm/settings/client";

export type ServiceRow = {
  id: number; name: string; slug: string; description: string | null; base_price: number | null;
  unit: string | null; duration_min: number | null; recurring: boolean; active: boolean;
};

const UNITS = ["visit", "service", "addon", "quote"] as const;
const money = (n: number) => `$${Number(n) % 1 === 0 ? Number(n).toFixed(0) : Number(n).toFixed(2)}`;

/** "Mow, edge, blow · from $45 / visit" — built only from what the row holds. */
function subline(s: ServiceRow): string {
  const parts: string[] = [];
  if (s.description) parts.push(s.description);
  if (s.base_price != null) parts.push(`from ${money(s.base_price)}${s.unit && s.unit !== "quote" ? ` / ${s.unit}` : ""}`);
  else parts.push("Quoted on site");
  return parts.join(" · ");
}

type Draft = { name: string; slug: string; description: string; base_price: string; unit: string; duration_min: string; recurring: boolean; active: boolean };
const toDraft = (s?: ServiceRow): Draft => ({
  name: s?.name ?? "", slug: s?.slug ?? "", description: s?.description ?? "",
  base_price: s?.base_price != null ? String(s.base_price) : "", unit: s?.unit ?? "visit",
  duration_min: s?.duration_min != null ? String(s.duration_min) : "", recurring: s?.recurring ?? false, active: s?.active ?? true,
});

export function ServicesSettings({ services }: { services: ServiceRow[] }) {
  const { save, busy, msg } = useSettingsSave();
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [err, setErr] = useState("");

  const open = (s?: ServiceRow) => { setDraft(toDraft(s)); setErr(""); if (s) setEditing(s); else setAdding(true); };
  const close = () => { setEditing(null); setAdding(false); };

  async function submit() {
    if (!draft.name.trim()) { setErr("Give the service a name."); return; }
    const payload = { ...draft, base_price: draft.base_price === "" ? null : draft.base_price, duration_min: draft.duration_min === "" ? null : draft.duration_min };
    const r = editing ? await save("service_update", { id: editing.id, ...payload }) : await save("service_create", payload);
    if (r.ok) close(); else setErr(r.error);
  }

  const set = (k: keyof Draft, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));
  const sheetOpen = Boolean(editing) || adding;

  return (
    <div className="space-y-4">
      <SaveStatus msg={msg} />
      <RowCard>
        {services.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-[color:var(--body)]">No services yet — add the first one below.</div>}
        {services.map((s) => (
          <div key={s.id} className="flex items-center gap-3 pr-4">
            <Row onClick={() => open(s)} lead={<Dot tone={s.active ? "sage" : "faint"} />} label={s.name} sub={subline(s)} muted={!s.active} className="flex-1 pr-0" />
            <Switch on={s.active} label={`${s.name} on`} disabled={busy} onChange={(v) => save("service_active", { id: s.id, active: v })} />
          </div>
        ))}
      </RowCard>

      <button type="button" onClick={() => open()} className="flex min-h-[52px] w-full items-center justify-center rounded-full border border-[color:var(--border-strong)] text-[15px] font-semibold text-[color:var(--ink)] transition hover:border-white/30 hover:bg-white/[0.04]">
        + Add a service
      </button>

      <p className="px-0.5 text-[13px] leading-relaxed text-[color:var(--body)]">
        Turning a service off hides it from the website form and Norma the same minute. Existing customers on that service keep their schedule.
      </p>

      <Sheet open={sheetOpen} onClose={close} title={editing ? "Edit service" : "New service"}
        footer={<Button className="h-12 w-full text-[14px]" onClick={submit} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add service"}</Button>}>
        <div className="pt-1">
          <Field label="Name"><input className={INPUT} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Weekly mowing" autoFocus={adding} /></Field>
          <Field label="Description"><input className={INPUT} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Mow, edge, trim & blow" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting price"><input className={INPUT} inputMode="decimal" value={draft.base_price} onChange={(e) => set("base_price", e.target.value)} placeholder="Quoted" /></Field>
            <Field label="Minutes"><input className={INPUT} inputMode="numeric" value={draft.duration_min} onChange={(e) => set("duration_min", e.target.value)} placeholder="—" /></Field>
          </div>
          <Field label="Priced per"><Segmented options={UNITS.map((u) => ({ value: u, label: u }))} value={(UNITS.includes(draft.unit as any) ? draft.unit : "visit") as (typeof UNITS)[number]} onChange={(v) => set("unit", v)} /></Field>
          <Field label="Repeats"><Segmented options={[{ value: "yes", label: "Recurring" }, { value: "no", label: "One-time" }]} value={draft.recurring ? "yes" : "no"} onChange={(v) => set("recurring", v === "yes")} /></Field>
          {editing && <Field label="Slug"><input className={`${INPUT} mo-mono text-[13px]`} value={draft.slug} onChange={(e) => set("slug", e.target.value)} /></Field>}
          {err && <p className="mb-3 text-[13px] text-coral">{err}</p>}
        </div>
      </Sheet>
    </div>
  );
}
