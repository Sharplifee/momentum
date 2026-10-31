"use client";

import { useState } from "react";
import { Sheet, Field, Segmented, INPUT } from "@/components/crm/Sheet";
import { Button } from "@/components/ui";
import { Avatar, Dot, Row, RowCard, Group, maskPhone } from "@/components/crm/settings/ui";
import { Switch, useSettingsSave, SaveStatus } from "@/components/crm/settings/client";

export type ZoneRow = { id: number; name: string; cities: string[] | null; notes: string | null; active: boolean };
export type CrewRow = {
  id: number; name: string; lead_profile: string | null; home_zone: number | null; max_daily_jobs: number | null;
  max_weekly_clients: number | null; phone: string | null; notes: string | null; active: boolean;
};
export type StaffRow = { id: string; full_name: string | null; role: string };

type ZoneDraft = { name: string; cities: string; notes: string; active: boolean };
type CrewDraft = { name: string; lead_profile: string; home_zone: string; max_daily_jobs: string; max_weekly_clients: string; phone: string; notes: string; active: boolean };

const zoneDraft = (z?: ZoneRow): ZoneDraft => ({ name: z?.name ?? "", cities: (z?.cities ?? []).join(", "), notes: z?.notes ?? "", active: z?.active ?? true });
const crewDraft = (c?: CrewRow): CrewDraft => ({
  name: c?.name ?? "", lead_profile: c?.lead_profile ?? "", home_zone: c?.home_zone != null ? String(c.home_zone) : "",
  max_daily_jobs: c?.max_daily_jobs != null ? String(c.max_daily_jobs) : "", max_weekly_clients: c?.max_weekly_clients != null ? String(c.max_weekly_clients) : "",
  phone: c?.phone ?? "", notes: c?.notes ?? "", active: c?.active ?? true,
});
/** "Zone 7 — South Jordan / Riverton" → "South Jordan / Riverton"; names without the prefix pass through. */
const shortZone = (n: string) => n.replace(/^zone\s*\d+\s*[—–-]\s*/i, "");

export function ZonesCrewsSettings({ zones, crews, staff }: { zones: ZoneRow[]; crews: CrewRow[]; staff: StaffRow[] }) {
  const { save, busy, msg } = useSettingsSave();
  const [zoneSheet, setZoneSheet] = useState<{ row: ZoneRow | null } | null>(null);
  const [crewSheet, setCrewSheet] = useState<{ row: CrewRow | null } | null>(null);
  const [zd, setZd] = useState<ZoneDraft>(zoneDraft());
  const [cd, setCd] = useState<CrewDraft>(crewDraft());
  const [err, setErr] = useState("");

  const active = zones.filter((z) => z.active);
  const off = zones.filter((z) => !z.active);
  const cities = Array.from(new Set(active.flatMap((z) => z.cities ?? [])));
  const zoneName = (id: number | null) => (id == null ? null : zones.find((z) => z.id === id)?.name ?? `Zone ${id}`);
  const staffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? null : null);

  const openZone = (z?: ZoneRow) => { setZd(zoneDraft(z)); setErr(""); setZoneSheet({ row: z ?? null }); };
  const openCrew = (c?: CrewRow) => { setCd(crewDraft(c)); setErr(""); setCrewSheet({ row: c ?? null }); };

  async function submitZone() {
    if (!zd.name.trim()) { setErr("Give the zone a name."); return; }
    const r = zoneSheet?.row ? await save("zone_update", { id: zoneSheet.row.id, ...zd }) : await save("zone_create", zd);
    if (r.ok) setZoneSheet(null); else setErr(r.error);
  }
  async function submitCrew() {
    if (!cd.name.trim()) { setErr("Give the crew a name."); return; }
    const payload = { ...cd, lead_profile: cd.lead_profile || null, home_zone: cd.home_zone === "" ? null : cd.home_zone, max_daily_jobs: cd.max_daily_jobs === "" ? null : cd.max_daily_jobs, max_weekly_clients: cd.max_weekly_clients === "" ? null : cd.max_weekly_clients };
    const r = crewSheet?.row ? await save("crew_update", { id: crewSheet.row.id, ...payload }) : await save("crew_create", payload);
    if (r.ok) setCrewSheet(null); else setErr(r.error);
  }

  const crewSub = (c: CrewRow) => [
    zoneName(c.home_zone) ? `home ${shortZone(zoneName(c.home_zone)!)}` : null,
    c.max_daily_jobs != null ? `${c.max_daily_jobs} jobs / day` : null,
    c.phone ? maskPhone(c.phone) : null,
  ].filter(Boolean).join(" · ") || "No details yet";

  return (
    <div className="space-y-5">
      <SaveStatus msg={msg} />

      {/* ---- service area ---- */}
      <section className="mo-card p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="mo-eyebrow leading-relaxed">{active.length ? `${active.length} zone${active.length === 1 ? "" : "s"} on · ${cities.length} cit${cities.length === 1 ? "y" : "ies"}` : "No zones on"}</span>
          <button type="button" onClick={() => openZone()} className="mo-eyebrow shrink-0 text-teal transition hover:text-[color:var(--ink)]">+ Zone</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {active.map((z) => (
            <button key={z.id} type="button" onClick={() => openZone(z)} title={z.name}
              className="mo-eyebrow rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-[10px] text-[color:var(--ink)] transition hover:border-white/30">
              {(z.cities ?? []).length ? (z.cities ?? []).join(" · ") : shortZone(z.name)}
            </button>
          ))}
          {off.map((z) => (
            <button key={z.id} type="button" onClick={() => openZone(z)} title={z.name}
              className="mo-eyebrow rounded-full border border-dashed border-[color:var(--border)] px-3 py-1.5 text-[10px] text-[color:var(--faint)] transition hover:text-[color:var(--body)]">
              + {shortZone(z.name)} · off
            </button>
          ))}
          {zones.length === 0 && <span className="text-[13px] text-[color:var(--body)]">Add the first zone to define the service area.</span>}
        </div>
      </section>

      {/* ---- crews ---- */}
      <Group label="Crews">
        <RowCard>
          {crews.map((c) => (
            <div key={c.id} className="flex items-center gap-3 pr-4">
              <Row onClick={() => openCrew(c)} lead={<Avatar name={c.name} size={36} />} label={c.name} sub={crewSub(c)} muted={!c.active} className="flex-1 pr-0" />
              <Dot tone={c.active ? "sage" : "faint"} />
            </div>
          ))}
          <Row onClick={() => openCrew()} lead={<span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-[color:var(--border-strong)] text-[color:var(--body)]">+</span>}
            label="Add a crew" sub="A truck, its lead, and how many jobs it can take in a day" muted chevron />
        </RowCard>
      </Group>

      {/* ---- zone sheet ---- */}
      <Sheet open={Boolean(zoneSheet)} onClose={() => setZoneSheet(null)} title={zoneSheet?.row ? "Edit zone" : "New zone"}
        footer={<Button className="h-12 w-full text-[14px]" onClick={submitZone} disabled={busy}>{busy ? "Saving…" : zoneSheet?.row ? "Save changes" : "Add zone"}</Button>}>
        <div className="pt-1">
          <Field label="Name"><input className={INPUT} value={zd.name} onChange={(e) => setZd({ ...zd, name: e.target.value })} placeholder="Zone 7 — South Jordan / Riverton" /></Field>
          <Field label="Cities · comma separated"><input className={INPUT} value={zd.cities} onChange={(e) => setZd({ ...zd, cities: e.target.value })} placeholder="South Jordan, Riverton, Daybreak" /></Field>
          <Field label="Notes"><input className={INPUT} value={zd.notes} onChange={(e) => setZd({ ...zd, notes: e.target.value })} placeholder="Optional" /></Field>
          <Field label="In the service area"><Segmented options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} value={zd.active ? "on" : "off"} onChange={(v) => setZd({ ...zd, active: v === "on" })} /></Field>
          {err && <p className="mb-3 text-[13px] text-coral">{err}</p>}
        </div>
      </Sheet>

      {/* ---- crew sheet ---- */}
      <Sheet open={Boolean(crewSheet)} onClose={() => setCrewSheet(null)} title={crewSheet?.row ? "Edit crew" : "New crew"}
        footer={<Button className="h-12 w-full text-[14px]" onClick={submitCrew} disabled={busy}>{busy ? "Saving…" : crewSheet?.row ? "Save changes" : "Add crew"}</Button>}>
        <div className="pt-1">
          <Field label="Name"><input className={INPUT} value={cd.name} onChange={(e) => setCd({ ...cd, name: e.target.value })} placeholder="Truck 1" /></Field>
          <Field label="Crew lead">
            <select className={INPUT} value={cd.lead_profile} onChange={(e) => setCd({ ...cd, lead_profile: e.target.value })}>
              <option value="">Not set</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name ?? s.id} · {s.role}</option>)}
            </select>
          </Field>
          <Field label="Home zone">
            <select className={INPUT} value={cd.home_zone} onChange={(e) => setCd({ ...cd, home_zone: e.target.value })}>
              <option value="">Not set</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.active ? "" : " · off"}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max jobs / day"><input className={INPUT} inputMode="numeric" value={cd.max_daily_jobs} onChange={(e) => setCd({ ...cd, max_daily_jobs: e.target.value })} placeholder="—" /></Field>
            <Field label="Max clients / week"><input className={INPUT} inputMode="numeric" value={cd.max_weekly_clients} onChange={(e) => setCd({ ...cd, max_weekly_clients: e.target.value })} placeholder="—" /></Field>
          </div>
          <Field label="Phone"><input className={INPUT} inputMode="tel" value={cd.phone} onChange={(e) => setCd({ ...cd, phone: e.target.value })} placeholder="+1 and ten digits" /></Field>
          <Field label="Notes"><input className={INPUT} value={cd.notes} onChange={(e) => setCd({ ...cd, notes: e.target.value })} placeholder="Optional" /></Field>
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-[color:var(--border)] px-4 py-3">
            <div><div className="text-[15px] font-medium text-[color:var(--ink)]">Active</div><div className="text-[12px] text-[color:var(--body)]">Off = no new jobs land with this crew</div></div>
            <Switch on={cd.active} label="Crew active" onChange={(v) => setCd({ ...cd, active: v })} />
          </div>
          {err && <p className="mb-3 text-[13px] text-coral">{err}</p>}
        </div>
      </Sheet>
    </div>
  );
}
