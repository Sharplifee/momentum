import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader, Chip, EmptyState, LinkButton } from "@/components/ui";
import { STAGE_STYLE, STAGE_LABEL, StageKey } from "@/lib/theme";
import Link from "next/link";
import { Tile } from "@/components/crm/Charts";
import { LeadFilterButton, type LeadFilterState } from "@/components/crm/LeadFilters";

export const dynamic = "force-dynamic";
const STAGES: StageKey[] = ["new", "contacted", "quote_sent", "closed_won", "not_qualified", "stale"];
const CHIP_LABEL: Record<string, string> = { new: "New", contacted: "Contacted", quote_sent: "Quote sent", closed_won: "Won", not_qualified: "Lost", stale: "Stale" };
const SOURCE_LABEL: Record<string, string> = { website: "website", meta_lead_ad: "Meta", phone: "phone", referral: "referral", door: "door", other: "other" };

function ageLabel(iso: string): string {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (m < 60) return `${Math.max(1, Math.floor(m))}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
const initials = (n: string | null) => (n ?? "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/**
 * The pipeline. Four counts, the stage chips, then every lead as a row: who,
 * where, what they asked for, how long ago, and whether Norma has it or a
 * person needs to step in.
 */
export default async function LeadsPage({ searchParams }: { searchParams: LeadFilterState }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const real = <T,>(q: any): T => q.neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%");

  let query = real<any>(db.from("leads").select("id, full_name, phone, city, zone_id, stage, source, service_interest, quote_amount, created_at, last_contact_at"));
  if (searchParams.stage) query = query.eq("stage", searchParams.stage);
  if (searchParams.zone) query = query.eq("zone_id", Number(searchParams.zone));
  if (searchParams.source) query = query.eq("source", searchParams.source);
  if (searchParams.q) query = query.or(`full_name.ilike.%${searchParams.q}%,phone.ilike.%${searchParams.q}%,address.ilike.%${searchParams.q}%`);
  if (searchParams.needs === "untouched") query = query.eq("stage", "new").lt("created_at", new Date(Date.now() - 86400_000).toISOString());
  query = searchParams.sort === "value" ? query.order("quote_amount", { ascending: false, nullsFirst: false })
    : searchParams.sort === "untouched" ? query.order("created_at", { ascending: true })
    : query.order("created_at", { ascending: false });
  const { data: leadsRaw } = await query.limit(200);
  let leads = (leadsRaw ?? []) as any[];

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data: allStages }, { count: weekCount }, { data: zones }, { data: threads }] = await Promise.all([
    real<any>(db.from("leads").select("stage")),
    real<any>(db.from("leads").select("id", { count: "exact", head: true })).gte("created_at", weekAgo),
    db.from("zones").select("id, name").eq("active", true).order("id"),
    leads.length ? db.from("threads").select("lead_id, escalated, last_message_at").in("lead_id", leads.map((l) => l.id)) : Promise.resolve({ data: [] as any[] }),
  ]);
  const counts: Record<string, number> = {};
  for (const l of allStages ?? []) counts[l.stage] = (counts[l.stage] ?? 0) + 1;
  const threadBy = new Map((threads ?? []).map((t: any) => [t.lead_id, t]));

  // What the row's right edge says — only states we can actually see in the data.
  const statusFor = (l: any): { label: string; tone: string } | null => {
    const t = threadBy.get(l.id);
    if (t?.escalated) return { label: "Needs you", tone: "text-coral" };
    if (l.stage === "closed_won" || l.stage === "not_qualified") return null;
    if (t?.last_message_at) return { label: "Norma on it", tone: "text-teal" };
    if (l.stage === "new") return { label: "Awaiting", tone: "text-[color:var(--body)]" };
    return null;
  };
  if (searchParams.needs === "human") leads = leads.filter((l) => statusFor(l)?.label === "Needs you");

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...over })) if (v) p.set(k, v);
    return `/crm/leads${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <PageHeader eyebrow="Pipeline" title="Leads"
        action={
          <div className="flex items-center gap-2">
            <LeadFilterButton current={searchParams} counts={counts} zones={(zones ?? []) as any} />
            <LinkButton href="/crm/leads/new">+ New lead</LinkButton>
          </div>
        } />

      <div className="mb-4 grid grid-cols-4 gap-2">
        <Tile label="New" value={weekCount ?? 0} note="this wk" />
        <Tile label="Waiting" value={<span className="text-teal">{counts["new"] ?? 0}</span>} href={qs({ stage: "new" })} />
        <Tile label="Quoted" value={counts["quote_sent"] ?? 0} href={qs({ stage: "quote_sent" })} />
        <Tile label="Won" value={<span className="text-gold">{counts["closed_won"] ?? 0}</span>} href={qs({ stage: "closed_won" })} />
      </div>

      <div className="mb-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        <Link href={qs({ stage: undefined })} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${!searchParams.stage ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>All</Link>
        {STAGES.map((s) => (
          <Link key={s} href={qs({ stage: s })} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${searchParams.stage === s ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>
            {CHIP_LABEL[s]} <span className={searchParams.stage === s ? "text-[#0a0a0a]/60" : "text-[color:var(--faint)]"}>{counts[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="mo-card p-0">
        <form className="border-b border-[color:var(--border)] px-4 py-3">
          {Object.entries(searchParams).filter(([k, v]) => k !== "q" && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
          <div className="flex items-center gap-2.5 text-[color:var(--faint)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input name="q" defaultValue={searchParams.q} placeholder="Search name, phone, or address" className="w-full bg-transparent text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]" />
          </div>
        </form>

        {!leads.length ? (
          <div className="p-4"><EmptyState title="No leads here yet" hint={searchParams.stage || searchParams.q ? "Nothing matches right now." : "New quote requests land here the moment they come in."} action={<LinkButton href="/crm/leads/new">+ New lead</LinkButton>} /></div>
        ) : leads.map((l) => {
          const st = statusFor(l);
          const sub = [l.city, l.service_interest?.toLowerCase(), l.source ? `via ${SOURCE_LABEL[l.source] ?? l.source}` : null].filter(Boolean).join(" · ");
          return (
            <Link key={l.id} href={`/crm/leads/${l.id}`} className="flex items-center gap-3 border-b border-[color:var(--border)] px-4 py-3 transition last:border-b-0 hover:bg-white/[0.03]">
              <span className="mo-mono grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:var(--border)] text-[12px] text-[color:var(--ink)]">{initials(l.full_name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[color:var(--ink)]">{l.full_name ?? l.phone}</span>
                  <Chip className={STAGE_STYLE[l.stage as StageKey]}>{CHIP_LABEL[l.stage] ?? STAGE_LABEL[l.stage as StageKey] ?? l.stage}</Chip>
                </div>
                <div className="truncate text-[13px] text-[color:var(--body)]">{sub || l.phone}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="mo-mono text-[12px] text-[color:var(--body)]">{ageLabel(l.created_at)}</div>
                {st && <div className={`mo-eyebrow mt-1 ${st.tone}`}>{st.label}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
