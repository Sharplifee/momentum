import Link from "next/link";
import { BookVisitButton } from "@/components/crm/BookVisitSheet";
import { StageRow } from "@/components/crm/LeadActions";
import { SOURCE_NAME, fmtPhone, ago } from "@/lib/leadTimeline";
import { supabaseServer } from "@/lib/supabase/server";

export async function LeadSplitDetail({ leadId }: { leadId: string }) {
  const db = supabaseServer();
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) {
    return <div className="p-4 text-sm text-[color:var(--body)]">Pick a lead on the left.</div>;
  }
  const { data: thread } = await db.from("threads").select("id, escalated").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const name = lead.full_name ?? fmtPhone(lead.phone) ?? "Lead";
  const sub = [[lead.address, lead.city].filter(Boolean).join(", ") || null, fmtPhone(lead.phone) || null, lead.source ? `via ${SOURCE_NAME[lead.source] ?? lead.source}` : null, ago(lead.created_at)].filter(Boolean).join(" · ");
  const visit = lead.quote_visit_date ? `${new Date(lead.quote_visit_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${lead.quote_visit_window ? ` · ${lead.quote_visit_window}` : ""}` : null;
  const threadHref = thread ? `/crm/messages?thread=${thread.id}` : `/crm/messages?new=${encodeURIComponent(lead.phone)}&lead=${lead.id}`;

  return (
    <div className="mo-card p-0">
      <div className="border-b border-[color:var(--border)] px-4 pb-2.5 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[18px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{name}</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-[color:var(--body)]">{sub}</p>
          </div>
          <Link href={`/crm/leads/${lead.id}`} className="mo-eyebrow shrink-0 text-teal">Open ›</Link>
        </div>
        {visit && <div className="mo-eyebrow mt-1.5 text-[color:var(--body)]">Quote visit {visit}</div>}
      </div>
      <div className="px-4 py-3">
        {(lead.stage === "new" || lead.stage === "contacted") && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[10px] border border-[color:var(--border)] px-3.5 py-2.5">
            <div>
              <div className="font-medium text-[color:var(--ink)]">Book a 2‑hour quote visit</div>
              <div className="text-[12.5px] text-[color:var(--body)]">Reply within 5 min, then pick a day.</div>
            </div>
            <BookVisitButton leadId={lead.id} zoneId={lead.zone_id ?? null} requestedDays={lead.requested_days as string[] | null} requestedWindow={lead.requested_window as string | null} />
          </div>
        )}
        <StageRow lead={{ id: lead.id, stage: lead.stage, full_name: lead.full_name }} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href={threadHref} className="rounded-full border border-[color:var(--border-strong)] py-2.5 text-center text-[13px] font-semibold text-[color:var(--ink)]">Text</Link>
          <a href={`tel:${lead.phone ?? ""}`} className="rounded-full border border-[color:var(--border-strong)] py-2.5 text-center text-[13px] font-semibold text-[color:var(--ink)]">Call</a>
        </div>
      </div>
    </div>
  );
}

