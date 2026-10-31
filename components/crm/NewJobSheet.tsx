"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Field, Segmented, ToggleRow, INPUT } from "./Sheet";

type Service = { id: number; name: string; recurring: boolean };
type Crew = { id: number; name: string };
type Hit = { type: string; id: string; label: string; sub: string };
type Property = { id: string; address: string; city: string | null; zone_id: number | null };

/** "Weekly Lawn Maintenance" has to fit a quarter of a phone's width. */
function shortName(n: string) {
  return n.replace(/\s*lawn\s*maintenance/i, "").replace(/spring\/fall\s*/i, "").replace(/landscaping\s*/i, "").replace(/\s*care$/i, "").trim() || n;
}

const WINDOWS = [
  { value: "07:00-09:00", label: "7–9 AM" },
  { value: "09:00-11:00", label: "9–11 AM" },
  { value: "11:00-13:00", label: "11–1" },
  { value: "13:00-15:00", label: "1–3 PM" },
  { value: "15:00-17:00", label: "3–5 PM" },
];

/**
 * "+ Job" from the Schedule. Customer → service → date/window → crew, with
 * the two decisions that matter as toggles: make it weekly, and text them now.
 */
export function NewJobSheet({ services, crews, defaultDate, open, onClose, smsPaused = null }: {
  smsPaused?: string | null;
  services: Service[]; crews: Crew[]; defaultDate: string; open: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [customer, setCustomer] = useState<Hit | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>(String(services[0]?.id ?? ""));
  const [date, setDate] = useState(defaultDate);
  const [win, setWin] = useState(WINDOWS[1].value);
  const [crewId, setCrewId] = useState<string>(crews.length === 1 ? String(crews[0].id) : String(crews[0]?.id ?? ""));
  const [repeat, setRepeat] = useState(false);
  const [text, setText] = useState(!smsPaused);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (customer || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/crm/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).catch(() => ({ hits: [] }));
      setHits((r.hits ?? []).filter((h: Hit) => h.type === "customer").slice(0, 6));
    }, 200);
    return () => clearTimeout(t);
  }, [q, customer]);

  useEffect(() => {
    if (!customer) { setProperties([]); setPropertyId(""); return; }
    fetch(`/api/crm/jobs?customer_id=${customer.id}`).then((r) => r.json()).then((d) => {
      const props: Property[] = d.properties ?? [];
      setProperties(props);
      setPropertyId(props[0]?.id ?? "");
    }).catch(() => null);
  }, [customer]);

  const service = services.find((s) => String(s.id) === serviceId);
  const canSave = Boolean(customer && propertyId && serviceId && date && crewId) && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr(null);
    const [ws, we] = win.split("-");
    const res = await fetch("/api/crm/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        customer_id: customer!.id, property_id: propertyId, service_id: Number(serviceId),
        scheduled_date: date, window_start: ws, window_end: we, crew_id: Number(crewId),
        repeat_weekly: repeat && Boolean(service?.recurring), text_customer: text,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error === "day_full" ? "That day is at capacity for this crew." : (j.error ?? "Couldn't save — try again.")); return; }
    onClose();
    router.push(`/crm/jobs/${j.job_id}`);
    router.refresh();
  }

  const prop = properties.find((p) => p.id === propertyId);
  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <Sheet open={open} onClose={onClose} title="New job"
      footer={
        <>
          {err && <div className="mb-2 text-center text-[12px] text-coral">{err}</div>}
          {customer && prop && (
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="mo-eyebrow">Route fit</span>
              <span className="text-teal">{dateLabel}{prop.zone_id ? ` · zone ${prop.zone_id}` : ""}{prop.city ? ` · ${prop.city}` : ""}</span>
            </div>
          )}
          <button onClick={save} disabled={!canSave} className="mo-primary w-full rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40">
            {busy ? "Saving…" : "Add to schedule"}
          </button>
        </>
      }>
      <Field label="Customer">
        {customer ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[color:var(--border)] bg-black/30 px-4 py-3">
            <span className="truncate text-[15px] text-[color:var(--ink)]">
              {customer.label}{prop ? ` · ${prop.address}` : ""}
            </span>
            <button onClick={() => { setCustomer(null); setQ(""); }} className="shrink-0 text-[13px] font-semibold text-teal">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name or phone" className={INPUT} autoFocus />
            {hits.length > 0 && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[#121212] shadow-pop">
                {hits.map((h) => (
                  <button key={h.id} onClick={() => { setCustomer(h); setHits([]); }} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.05]">
                    <span className="text-[14px] text-[color:var(--ink)]">{h.label}</span>
                    <span className="mo-mono text-[11px] text-[color:var(--body)]">{h.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {customer && properties.length > 1 && (
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={`${INPUT} mt-2`}>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.address}{p.city ? `, ${p.city}` : ""}</option>)}
          </select>
        )}
      </Field>

      <Field label="Service">
        <Segmented
          options={services.slice(0, 4).map((s) => ({ value: String(s.id), label: shortName(s.name) }))}
          value={serviceId} onChange={setServiceId} />
        {services.length > 4 && (
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={`${INPUT} mt-2`}>
            {services.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
        )}
      </Field>

      <div className="grid grid-cols-[1.3fr_1fr] gap-3">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} /></Field>
        <Field label="Window">
          <select value={win} onChange={(e) => setWin(e.target.value)} className={INPUT}>
            {WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Crew">
        <Segmented options={crews.map((c) => ({ value: String(c.id), label: c.name }))} value={crewId} onChange={setCrewId} />
      </Field>

      {service?.recurring && (
        <ToggleRow title="Repeat weekly" help="Same day and window until paused" on={repeat} onChange={setRepeat} />
      )}
      <ToggleRow title="Text confirmation now" help={smsPaused ? `Texting is paused · ${smsPaused}` : "Norma sends the date, window and what to expect"} on={text} onChange={setText} />
    </Sheet>
  );
}

export function NewJobButton(props: Omit<React.ComponentProps<typeof NewJobSheet>, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-full border border-[color:var(--border-strong)] px-3.5 py-1.5 text-[13px] font-semibold text-[color:var(--ink)] transition hover:border-white/30">+ Job</button>
      <NewJobSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
