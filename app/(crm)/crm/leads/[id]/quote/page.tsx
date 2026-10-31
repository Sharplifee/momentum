import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { QuoteChecklist } from "@/components/crm/QuoteChecklist";
import { QuoteBuilder, type ServiceRow, type QuoteRow } from "@/components/crm/QuoteBuilder";
import { STAGE_NAME, fmtPhone } from "@/lib/leadTimeline";

export const dynamic = "force-dynamic";

/**
 * Build the quote — from the driveway. The walk-through answers sit on top,
 * the priced lines below, and the text that goes to the customer is shown
 * before it is sent.
 */
export default async function QuotePage({ params }: { params: { id: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const { data: lead } = await db.from("leads").select("*").eq("id", params.id).maybeSingle();
  if (!lead) notFound();

  const [{ data: services }, { data: quotes }] = await Promise.all([
    db.from("services").select("id, name, slug, base_price, unit").eq("active", true).order("id"),
    db.from("quotes").select("id, line_items, total, status, created_at, sent_at").eq("lead_id", lead.id).order("created_at", { ascending: false }),
  ]);

  const name = lead.full_name ?? fmtPhone(lead.phone);
  const visit = lead.quote_visit_date
    ? `Quote visit · ${new Date(lead.quote_visit_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${lead.quote_visit_window ? ` · ${lead.quote_visit_window}` : ""}`
    : `Quote · ${STAGE_NAME[lead.stage] ?? lead.stage}`;
  const sub = [
    lead.address ? `${lead.address}${lead.city ? `, ${lead.city}` : ""}` : lead.city,
    lead.lat && lead.lng ? "pinned" : null,
  ].filter(Boolean).join(" · ");

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-3xl">
        <nav className="mo-eyebrow -mt-1 mb-4 flex min-w-0 items-center gap-1.5">
          <Link href="/crm/leads" className="shrink-0 transition hover:text-[color:var(--ink)]">‹ Leads</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <Link href={`/crm/leads/${lead.id}`} className="truncate transition hover:text-[color:var(--ink)]">{name}</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span className="shrink-0 text-[color:var(--ink)]">Quote</span>
        </nav>

        <div className="mb-3">
          <div className="mo-eyebrow text-teal">{visit}</div>
          <h1 className="mt-1.5 font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-[color:var(--ink)]">Build the quote</h1>
          {sub && <p className="mt-1.5 text-[13px] text-[color:var(--body)]">{sub}</p>}
        </div>

        <div className="mb-3">
          <QuoteChecklist title="Walk-through" line lead={{
            id: lead.id, has_dog: lead.has_dog, gate_width_in: lead.gate_width_in, obstacles: lead.obstacles,
            watering_day: lead.watering_day, bags_clippings: lead.bags_clippings, premium_handling: lead.premium_handling,
            haul_clippings: lead.haul_clippings,
          }} />
        </div>

        <QuoteBuilder
          lead={{ id: lead.id, first: (lead.full_name ?? "there").split(" ")[0], phone: fmtPhone(lead.phone), service_interest: lead.service_interest }}
          services={(services ?? []) as ServiceRow[]}
          quotes={(quotes ?? []) as QuoteRow[]}
          staffFirst={(profile.full_name ?? "the team").split(" ")[0]}
        />
      </div>
    </Shell>
  );
}
