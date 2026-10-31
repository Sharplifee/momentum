import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { RescheduleButton, type DayOption } from "@/components/crm/RescheduleSheet";
import { JobActions } from "@/components/crm/JobActions";
import { VisitActions } from "@/components/crm/VisitActions";

export const dynamic = "force-dynamic";

const fmtTime = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}`;
};
const fmtWindow = (s: string | null, e: string | null) => {
  if (!s) return "";
  const ap = Number((e ?? s).slice(0, 2)) >= 12 ? "PM" : "AM";
  return e ? `${fmtTime(s)}–${fmtTime(e)} ${ap}` : `${fmtTime(s)} ${ap}`;
};
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Job sheet — everything the person driving to this stop needs on one screen,
 * with Reschedule at the top and Start/Cancel at the bottom.
 */
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ profile, role, realRole, previewing, db }, { id }] = await Promise.all([
    requireStaff(["owner", "manager", "crew"]),
    params,
  ]);

  const { data: job } = await db
    .from("jobs")
    .select("id, scheduled_date, window_start, window_end, status, price, notes, crew_id, agreement_id, arrival_at, departure_at, weather_flag, customer_id, properties(address, city, gate_code, pets, access_notes, lot_notes, bags_clippings, haul_clippings, has_dog, lat, lng), services(name, recurring), customers(id, full_name, phone), crews(name), service_agreements(frequency, day_of_week, season_start)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  const j: any = job;
  const prop = j.properties; const svc = j.services; const cust = j.customers; const crew = j.crews; const ag = j.service_agreements;
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  const [{ data: dayJobs }, { data: events }, { data: invoice }, { data: lastSms }, { data: crewCfg }, { data: thread }] = await Promise.all([
    db.from("jobs").select("id, window_start").eq("scheduled_date", j.scheduled_date).eq("crew_id", j.crew_id ?? -1).neq("status", "cancelled").order("window_start"),
    db.from("job_events").select("type, note, created_at, actor").eq("job_id", id).order("created_at", { ascending: false }).limit(6),
    db.from("invoices").select("id, number, status, total").eq("job_id", id).maybeSingle(),
    db.from("messages").select("created_at, meta").eq("direction", "outbound").contains("meta", { to: cust?.phone ?? "—" }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("crews").select("id, max_daily_jobs").eq("id", j.crew_id ?? -1).maybeSingle(),
    db.from("threads").select("id").eq("phone", cust?.phone ?? "—").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Finished visit: GPS proof, photos, completion text, device — the visit record.
  const completed = j.status === "completed";
  const [{ data: proof }, { data: photoEvents }, { data: flagged }, { data: device }] = completed
    ? await Promise.all([
        db.from("service_proofs").select("statement, arrival_at, departure_at, minutes_on_site, ping_count, closest_meters, method, sms_sent_at").eq("job_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("job_events").select("photo_url, note, created_at").eq("job_id", id).eq("type", "photo").order("created_at"),
        db.from("exceptions").select("id").eq("job_id", id).eq("type", "flagged").limit(1).maybeSingle(),
        crew ? db.from("tracked_devices").select("label, model, battery_level, last_seen_at").eq("profile_id", (await db.from("crews").select("lead_profile").eq("id", j.crew_id).single()).data?.lead_profile ?? "00000000-0000-0000-0000-000000000000").order("last_seen_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null as any }),
      ])
    : [{ data: null }, { data: [] }, { data: null }, { data: null }] as any;
  const photos: string[] = [];
  for (const e of (photoEvents ?? []) as any[]) {
    if (!e.photo_url) continue;
    const { data: signed } = await db.storage.from("job-photos").createSignedUrl(e.photo_url, 3600);
    if (signed?.signedUrl) photos.push(signed.signedUrl);
  }
  const tclock = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }) : "";
  const onSiteMin = proof?.minutes_on_site ?? (j.arrival_at && j.departure_at ? Math.max(1, Math.round((new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 60000)) : null);

  const stopIdx = (dayJobs ?? []).findIndex((d) => d.id === id);
  const stops = dayJobs?.length ?? 0;

  // Next workable days for the Reschedule sheet, labelled the way the design does.
  const base = new Date(j.scheduled_date + "T12:00:00");
  const candidates: string[] = [];
  for (let i = 1; candidates.length < 4 && i < 14; i++) {
    const d = new Date(base.getTime() + i * 86400_000);
    if (d.getDay() === 0) continue; // no Sunday routes
    candidates.push(d.toLocaleDateString("en-CA"));
  }
  const { data: loads } = await db.from("jobs").select("scheduled_date, weather_flag").in("scheduled_date", candidates).eq("crew_id", j.crew_id ?? -1).neq("status", "cancelled");
  const cap = crewCfg?.max_daily_jobs ?? 12;
  const days: DayOption[] = candidates.map((iso) => {
    const d = new Date(iso + "T12:00:00");
    const onDay = (loads ?? []).filter((l) => l.scheduled_date === iso);
    const open = cap - onDay.length;
    const rain = onDay.some((l) => l.weather_flag);
    return {
      iso, dow: d.toLocaleDateString("en-US", { weekday: "short" }), num: d.getDate(),
      note: open <= 0 ? "full" : rain ? "rain flagged" : onDay.length > 0 ? "on route" : `${open} open`,
      tone: open <= 0 ? "full" : rain ? "rain" : onDay.length > 0 ? "route" : "open",
    };
  });

  const dateLabel = base.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const statusLabel = j.status === "in_progress" ? "On site" : j.status.replace("_", " ");
  const statusTone = j.status === "completed" ? "text-sage" : j.status === "exception" || j.status === "cancelled" ? "text-coral" : j.status === "in_progress" ? "text-teal" : "text-teal";
  const mapsHref = prop?.lat && prop?.lng ? `https://maps.apple.com/?daddr=${prop.lat},${prop.lng}` : `https://maps.apple.com/?daddr=${encodeURIComponent(`${prop?.address ?? ""} ${prop?.city ?? ""}`)}`;
  const recurrence = ag ? `${ag.frequency === "weekly" ? "Every" : ag.frequency === "biweekly" ? "Every other" : ""} ${DOW[ag.day_of_week ?? base.getDay()]}${ag.season_start ? ` · since ${new Date(ag.season_start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`.trim() : "One-time visit";
  const clippings = prop?.haul_clippings ? "Bag · haul" : prop?.bags_clippings ? "Bag" : "Mulch";
  const customerNote = (events ?? []).find((e) => e.type === "customer_note")?.note ?? j.notes ?? null;
  const confirm = lastSms as any;
  const confirmLine = confirm
    ? confirm.meta?.delivery === "SMS_DELIVERED" ? `Delivered ${new Date(confirm.meta.delivery_at ?? confirm.created_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })}`
      : confirm.meta?.delivery === "SMS_FAILED" ? "Failed"
      : `Sent ${new Date(confirm.created_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })}`
    : "Not sent";

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 border-t border-[color:var(--border)] py-2.5 text-[14px] first:border-t-0">
      <span className="shrink-0 text-[color:var(--body)]">{k}</span>
      <span className="text-right text-[color:var(--ink)]">{v}</span>
    </div>
  );

  if (completed) {
    const arrive = proof?.arrival_at ?? j.arrival_at; const leave = proof?.departure_at ?? j.departure_at;
    const verified = Boolean(proof) && (proof?.method ?? "") !== "manual";
    const completionText = confirm && leave && new Date(confirm.created_at).getTime() >= new Date(leave).getTime() - 60_000 ? confirm : null;
    const dev: any = device;
    return (
      <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
        <div className="mx-auto max-w-3xl">
          <nav className="mo-eyebrow mb-4 flex items-center gap-1.5">
            <Link href="/crm/customers" className="transition hover:text-[color:var(--ink)]">‹ Customers</Link>
            <span className="text-[color:var(--faint)]">/</span>
            {cust?.id ? <Link href={`/crm/customers/${cust.id}`} className="transition hover:text-[color:var(--ink)]">{(cust.full_name ?? "Customer").split(" ").slice(-1)[0]}</Link> : <span>Customer</span>}
            <span className="text-[color:var(--faint)]">/</span>
            <span>{base.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </nav>

          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className={`mo-eyebrow ${verified ? "text-sage" : ""}`}>{verified ? "GPS-verified" : "Completed"}{crew?.name ? ` · ${crew.name}` : ""}</div>
              <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">{dateLabel}</h1>
              <p className="text-[14px] text-[color:var(--body)]">{svc?.name ?? "Visit"}{prop?.address ? ` · ${prop.address}` : ""}</p>
            </div>
            {onSiteMin != null && (
              <div className="shrink-0 text-right">
                <div className="font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{onSiteMin}<span className="text-[15px] font-normal text-[color:var(--body)]"> m</span></div>
                <div className="mo-eyebrow">on site</div>
              </div>
            )}
          </div>

          <section className="mo-card aiv-glow mb-3 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Dwell</h2>
              <span className="mo-eyebrow">{arrive ? `${tclock(arrive)} → ${tclock(leave)}` : "no clock times"}</span>
            </div>
            {arrive && leave && (
              <div className="mt-3">
                <div className="flex justify-between"><span className="mo-eyebrow">arrive {tclock(arrive)}</span><span className="mo-eyebrow">leave {tclock(leave)}</span></div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-teal/25"><div className="h-full rounded-full bg-sage" style={{ width: "100%" }} /></div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 text-[14px]">
              <span className="text-[color:var(--body)]">{proof?.statement ?? (proof?.ping_count ? `${proof.ping_count} pings · closest ${Math.round(proof.closest_meters ?? 0)} m` : "No GPS record for this visit")}</span>
              <span className={verified ? "shrink-0 text-sage" : "shrink-0 text-[color:var(--faint)]"}>{verified ? "Verified" : "Unverified"}</span>
            </div>
          </section>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => photos[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={photos[i]} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-xl border border-[color:var(--border)] object-cover" />
            ) : (
              <div key={i} className="mo-eyebrow grid aspect-square place-items-center rounded-xl border border-dashed border-[color:var(--border)] text-[color:var(--faint)]">{i === 0 ? "No photo" : ""}</div>
            ))}
          </div>

          <section className="mo-card mb-3 px-4 py-3">
            <h2 className="mb-1 font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Record</h2>
            <Row k="Crew note" v={(events ?? []).find((e) => e.type === "departed" && e.note)?.note ?? j.notes ?? "—"} />
            <Row k="Completion text" v={completionText
              ? <span className={completionText.meta?.delivery === "SMS_DELIVERED" ? "text-sage" : completionText.meta?.delivery === "SMS_FAILED" ? "text-coral" : ""}>Sent {tclock(completionText.created_at)}{completionText.meta?.delivery === "SMS_DELIVERED" ? " · delivered" : completionText.meta?.delivery === "SMS_FAILED" ? " · failed" : ""}</span>
              : proof?.sms_sent_at ? `Sent ${tclock(proof.sms_sent_at)}` : "Not sent"} />
            <Row k="Invoice" v={invoice ? `INV-${String(invoice.number).padStart(4, "0")} · $${Number(invoice.total).toFixed(0)} · ${invoice.status}` : "Not drafted"} />
            <Row k="Device" v={dev ? <span className="mo-mono text-[13px]">{dev.label ?? dev.model ?? "Phone"}{dev.battery_level != null ? ` · battery ${Math.round(Number(dev.battery_level) <= 1 ? Number(dev.battery_level) * 100 : Number(dev.battery_level))}%` : ""}</span> : "—"} />
          </section>

          <VisitActions jobId={id} threadHref={cust?.phone ? (thread ? `/crm/messages?thread=${thread.id}` : `/crm/messages?new=${encodeURIComponent(cust.phone)}`) : null} alreadyFlagged={Boolean(flagged)} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <nav className="mo-eyebrow flex items-center gap-1.5">
            <Link href="/crm/schedule" className="transition hover:text-[color:var(--ink)]">‹ Schedule</Link>
            <span className="text-[color:var(--faint)]">/</span>
            <Link href={`/crm/schedule?m=${j.scheduled_date.slice(0, 7)}&d=${j.scheduled_date}`} className="transition hover:text-[color:var(--ink)]">{dateLabel}</Link>
          </nav>
          {j.status !== "completed" && j.status !== "cancelled" && (
            <RescheduleButton jobId={id} customerFirst={(cust?.full_name ?? "").split(" ")[0]} days={days} currentWindow={j.window_start} />
          )}
        </div>

        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={`mo-eyebrow ${statusTone}`}>{statusLabel}{j.window_start ? ` · ${fmtWindow(j.window_start, j.window_end)}` : ""}</div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">{cust?.full_name ?? "Customer"}</h1>
            <p className="text-[14px] text-[color:var(--body)]">{svc?.name ?? "Visit"}{prop?.address ? ` · ${prop.address}${prop.city ? `, ${prop.city}` : ""}` : ""}</p>
          </div>
          {j.price != null && (
            <div className="shrink-0 text-right">
              <div className="font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">${Number(j.price).toFixed(0)}</div>
              <div className="mo-eyebrow">{ag ? "per visit" : "quoted"}</div>
            </div>
          )}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {cust?.phone && <Link href={thread ? `/crm/messages?thread=${thread.id}` : `/crm/messages?new=${encodeURIComponent(cust.phone)}`} className="rounded-full border border-teal/50 py-3 text-center text-[14px] font-semibold text-[color:var(--ink)]">Text</Link>}
          {cust?.phone && <a href={`tel:${cust.phone}`} className="rounded-full border border-teal/50 py-3 text-center text-[14px] font-semibold text-[color:var(--ink)]">Call</a>}
          <a href={mapsHref} target="_blank" rel="noreferrer" className="rounded-full border border-teal/50 py-3 text-center text-[14px] font-semibold text-[color:var(--ink)]">Apple Maps</a>
        </div>

        <section className="mo-card aiv-glow mb-3 px-4 py-3">
          <h2 className="mb-1 font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Job sheet</h2>
          <Row k="Crew" v={crew?.name ? `${crew.name}${stops ? ` · stop ${stopIdx + 1} of ${stops}` : ""}` : "Unassigned"} />
          <Row k="Recurrence" v={recurrence} />
          <Row k="Gate" v={prop?.gate_code ? `${prop.gate_code}${prop.access_notes ? ` · ${prop.access_notes}` : ""}` : prop?.access_notes ?? "—"} />
          <Row k="Pets" v={prop?.pets ?? (prop?.has_dog ? "Dog on property" : "None noted")} />
          <Row k="Clippings" v={clippings} />
          {prop?.lot_notes && <Row k="Lot" v={prop.lot_notes} />}
        </section>

        <section className="mo-card mb-3 px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Customer note</h2>
            {events?.find((e) => e.type === "customer_note") && <span className="mo-eyebrow">{new Date(events.find((e) => e.type === "customer_note")!.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          </div>
          <p className="text-[14px] leading-snug text-[color:var(--ink)]">{customerNote ? `“${customerNote}”` : <span className="text-[color:var(--body)]">No notes from the customer.</span>}</p>
        </section>

        <section className="mo-card mb-28 px-4 py-3 md:mb-6">
          <h2 className="mb-1 font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Status</h2>
          <Row k="Confirmation text" v={<span className={confirmLine.startsWith("Delivered") ? "text-sage" : confirmLine === "Failed" ? "text-coral" : ""}>{confirmLine}</span>} />
          <Row k="Invoice" v={invoice ? `#${invoice.number} · ${invoice.status} · $${Number(invoice.total).toFixed(0)}` : j.status === "completed" ? "Drafting" : "Auto on completion"} />
          {j.arrival_at && <Row k="Arrived" v={new Date(j.arrival_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })} />}
          {j.departure_at && <Row k="Done" v={new Date(j.departure_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })} />}
          {(events ?? []).length > 0 && (
            <div className="mt-2 border-t border-[color:var(--border)] pt-2">
              {(events ?? []).slice(0, 4).map((e, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
                  <span className="text-[color:var(--body)]">{e.type.replace(/_/g, " ")}{e.note ? ` · ${e.note}` : ""}</span>
                  <span className="mo-mono shrink-0 text-[10px] text-[color:var(--faint)]">{new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" })}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <JobActions jobId={id} status={j.status} isToday={j.scheduled_date === todayIso} />
      </div>
    </Shell>
  );
}
