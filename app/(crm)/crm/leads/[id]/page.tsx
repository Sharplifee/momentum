import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { NotQualifiedButton, LeadPills, StageRow } from "@/components/crm/LeadActions";
import { QuoteChecklist } from "@/components/crm/QuoteChecklist";
import { SOURCE_NAME, STAGE_NAME, fmtPhone, fmtStamp, ago, humanizeLeadEvent, humanizeMessage, deliveryState } from "@/lib/leadTimeline";

export const dynamic = "force-dynamic";

const TRACK = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "quote_sent", label: "Quote sent" },
  { key: "closed_won", label: "Won" },
];
// quote_scheduled sits between Contacted and Quote sent — the visit is booked, the price isn't out yet.
const TRACK_INDEX: Record<string, number> = { new: 0, contacted: 1, quote_scheduled: 1, quote_sent: 2, closed_won: 3 };

/**
 * One lead, the way the design lays it out: who and where, how far along,
 * the three things you can do next, what they asked for, the on-site
 * checklist, and everything that has happened — newest first.
 */
export default async function LeadDetail({ params }: { params: { id: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const { data: lead } = await db.from("leads").select("*").eq("id", params.id).single();
  const shell = (children: React.ReactNode) => (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>{children}</Shell>
  );
  if (!lead) return shell(<p className="text-sm text-[color:var(--body)]">Lead not found.</p>);

  const [{ data: events }, { data: thread }, { data: zone }, { data: service }] = await Promise.all([
    db.from("lead_events").select("type, detail, actor, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(60),
    db.from("threads").select("id, escalated").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    lead.zone_id ? db.from("zones").select("id, name").eq("id", lead.zone_id).maybeSingle() : Promise.resolve({ data: null as { id: number; name: string } | null }),
    lead.service_interest ? db.from("services").select("name").eq("slug", lead.service_interest).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
  ]);
  const { data: messages } = thread
    ? await db.from("messages").select("direction, sender, body, meta, created_at").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(60)
    : { data: [] as any[] };

  type Line = { ts: string; text: string; dim?: boolean; tone?: "ok" | "bad" };
  const timeline: Line[] = [
    ...(events ?? []).map((e): Line => ({ ts: e.created_at, text: humanizeLeadEvent(e), dim: e.type.startsWith("nudge_sent_") || e.type === "repeat_submission" })),
    ...(messages ?? []).map((m: any): Line => {
      const st = m.direction === "outbound" ? deliveryState(m.meta) : null;
      return { ts: m.created_at, text: humanizeMessage(m), tone: st?.tone === "bad" ? "bad" : undefined };
    }),
  ].sort((a, b) => (a.ts < b.ts ? 1 : -1));

  const name = lead.full_name ?? fmtPhone(lead.phone) ?? "Lead";
  const stepIdx = TRACK_INDEX[lead.stage] ?? -1;
  const offTrack = lead.stage === "not_qualified" || lead.stage === "stale";
  const latest = timeline[0];
  const threadHref = thread ? `/crm/messages?thread=${thread.id}` : `/crm/messages?new=${encodeURIComponent(lead.phone)}&lead=${lead.id}`;

  const sub = [
    [lead.address, lead.city].filter(Boolean).join(", ") || null,
    fmtPhone(lead.phone) || null,
    lead.source ? `via ${SOURCE_NAME[lead.source] ?? lead.source}` : null,
    ago(lead.created_at),
  ].filter(Boolean).join(" · ");

  const serviceName = service?.name ?? (lead.service_interest ? lead.service_interest.replace(/-/g, " ") : null);
  const slot = [
    lead.requested_days?.length ? (lead.requested_days as string[]).join(", ") : null,
    lead.requested_window ?? null,
  ].filter(Boolean).join(" · ");
  const zoneLine = lead.zone_id
    ? `${zone?.name ?? `Zone ${lead.zone_id}`}${lead.city && !(zone?.name ?? "").toLowerCase().includes(lead.city.toLowerCase()) ? ` · ${lead.city}` : ""} · in area`
    : lead.city ? `${lead.city} · no zone matched` : "not matched";
  const sourceLine = lead.source
    ? `${lead.source === "website" ? "Website form" : SOURCE_NAME[lead.source]?.replace(/^\w/, (c: string) => c.toUpperCase()) ?? lead.source}${lead.fbclid ? " · fbclid captured" : lead.meta_lead_id ? " · lead ID on file" : ""}`
    : "—";
  const visit = lead.quote_visit_date
    ? `${new Date(lead.quote_visit_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${lead.quote_visit_window ? ` · ${lead.quote_visit_window}` : ""}`
    : null;

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 border-t border-[color:var(--border)] py-2.5 text-[13px]">
      <span className="shrink-0 text-[color:var(--body)]">{k}</span>
      <span className="min-w-0 text-right text-[color:var(--ink)]">{v}</span>
    </div>
  );

  return shell(
    <div className="mx-auto max-w-3xl">
      <div className="-mt-1 mb-4 flex items-center justify-between gap-3">
        <nav className="mo-eyebrow flex min-w-0 items-center gap-1.5">
          <Link href="/crm/leads" className="shrink-0 transition hover:text-[color:var(--ink)]">‹ Leads</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span className="truncate text-[color:var(--ink)]">{name}</span>
        </nav>
        <NotQualifiedButton lead={{ id: lead.id, stage: lead.stage, full_name: lead.full_name }} />
      </div>

      <div className="mb-3">
        <h1 className="font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-[color:var(--ink)]">{name}</h1>
        <p className="mt-1.5 text-[13px] text-[color:var(--body)]">{sub}</p>
      </div>

      <section className="mo-card aiv-glow mb-3 px-4 py-3.5">
        <div className="flex gap-1.5">
          {TRACK.map((s, i) => {
            const on = !offTrack && i <= stepIdx;
            const current = !offTrack && i === stepIdx;
            return (
              <div key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={`h-[3px] w-full rounded-full ${on ? "bg-teal" : "bg-white/[0.08]"}`} />
                <span className={`mo-eyebrow text-[9px] ${current ? "text-[color:var(--ink)]" : on ? "text-teal" : ""}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3.5 flex items-start gap-2.5">
          <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${offTrack ? "bg-coral" : thread?.escalated ? "bg-gold" : "bg-teal"}`} />
          <span className="min-w-0 text-[13px] leading-snug text-[color:var(--ink)]">
            {offTrack && <span className="text-coral">{STAGE_NAME[lead.stage]} · </span>}
            {thread?.escalated && <span className="text-gold">Norma handed this to you · </span>}
            {latest ? latest.text : "No activity yet."}
            {visit && <span className="text-[color:var(--body)]"> · Quote visit {visit}</span>}
          </span>
        </div>
      </section>

      <div className="mb-3">
        <LeadPills lead={{ id: lead.id, stage: lead.stage, full_name: lead.full_name }} threadHref={threadHref} />
      </div>

      <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
        <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Request</h2>
        <Row k="Service" v={serviceName ?? <span className="text-[color:var(--body)]">Not stated</span>} />
        <Row k="Preferred slot" v={slot || <span className="text-[color:var(--body)]">Any time</span>} />
        <Row k="Zone" v={zoneLine} />
        {lead.lat && lead.lng ? (
          <Row k="Lot (parcel)" v={<a href={`https://maps.apple.com/?ll=${lead.lat},${lead.lng}&q=${encodeURIComponent(lead.address ?? "Lot")}`} target="_blank" rel="noreferrer" className="text-teal">Pinned · Apple Maps</a>} />
        ) : (
          <Row k="Lot (parcel)" v={<span className="text-[color:var(--body)]">Pinned at the quote visit</span>} />
        )}
        <Row k="Source" v={sourceLine} />
        {lead.quote_amount != null && <Row k="Quoted" v={`$${Number(lead.quote_amount).toFixed(0)}`} />}
        <StageRow lead={{ id: lead.id, stage: lead.stage, full_name: lead.full_name }} />
      </section>

      <div className="mb-3">
        <QuoteChecklist title="Quote visit checklist" lead={{
          id: lead.id, has_dog: lead.has_dog, gate_width_in: lead.gate_width_in, obstacles: lead.obstacles,
          watering_day: lead.watering_day, bags_clippings: lead.bags_clippings, premium_handling: lead.premium_handling,
          haul_clippings: lead.haul_clippings,
        }} />
      </div>

      <section className="mo-card mb-6 px-4 pb-1 pt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Timeline</h2>
          <span className="mo-eyebrow">Newest first</span>
        </div>
        {timeline.length ? timeline.map((t, i) => (
          <div key={i} className="flex gap-2.5 border-t border-[color:var(--border)] py-2.5 text-[12.5px]">
            <span className="mo-mono w-[58px] shrink-0 pt-px text-[11.5px] text-[color:var(--body)]">{fmtStamp(t.ts)}</span>
            <span className={`min-w-0 leading-snug ${t.tone === "bad" ? "text-coral" : t.dim ? "text-[color:var(--body)]" : "text-[color:var(--ink)]"}`}>{t.text}</span>
          </div>
        )) : (
          <p className="border-t border-[color:var(--border)] py-3 text-[13px] text-[color:var(--body)]">Nothing has happened on this lead yet.</p>
        )}
      </section>
    </div>
  );
}
