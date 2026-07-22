import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader, Chip, EmptyState, LinkButton } from "@/components/ui";
import { STAGE_STYLE, STAGE_LABEL, StageKey } from "@/lib/theme";
import Link from "next/link";
import { DeltaTile, FunnelChart, AreaChart, BandCard } from "@/components/crm/Charts";

export const dynamic = "force-dynamic";
const STAGES: StageKey[] = ["new", "contacted", "quote_sent", "closed_won", "not_qualified", "stale"];

function ageLabel(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function LeadsPage({ searchParams }: { searchParams: { q?: string; stage?: string; view?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  let query = db.from("leads").select("id, full_name, phone, city, zone_id, stage, score, service_interest, quote_amount, created_at").neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%").order("created_at", { ascending: false }).limit(200);
  if (searchParams.stage) query = query.eq("stage", searchParams.stage);
  if (searchParams.q) query = query.or(`full_name.ilike.%${searchParams.q}%,phone.ilike.%${searchParams.q}%,address.ilike.%${searchParams.q}%`);
  const { data: leads } = await query;

  const counts: Record<string, number> = {};
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [{ data: allStages }, { data: series }] = await Promise.all([
    db.from("leads").select("stage").neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%"),
    db.from("leads").select("created_at").gte("created_at", twoWeeksAgo).neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%"),
  ]);
  for (const l of allStages ?? []) counts[l.stage] = (counts[l.stage] ?? 0) + 1;
  const dayCounts = Array.from({ length: 14 }, () => 0);
  for (const l of series ?? []) {
    const idx = 13 - Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400_000);
    if (idx >= 0 && idx < 14) dayCounts[idx]++;
  }
  const wk = dayCounts.slice(7).reduce((a, b) => a + b, 0);
  const pwk = dayCounts.slice(0, 7).reduce((a, b) => a + b, 0);
  const wkD = pwk ? Math.round(((wk - pwk) / pwk) * 100) : (wk ? 100 : 0);
  const kanban = searchParams.view === "kanban";

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Pipeline</div>
      <PageHeader title="Leads" action={<LinkButton href="/crm/leads?new=1">+ New lead</LinkButton>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DeltaTile label="This Week" value={wk} delta={`${wkD >= 0 ? "+" : ""}${wkD}% vs last`} up={wkD >= 0} icon="◎" seed={3} />
        <DeltaTile label="Awaiting First Touch" value={counts["new"] ?? 0} delta="speed wins" href="/crm/leads?stage=new" icon="⚡" seed={7} />
        <DeltaTile label="Quotes Out" value={counts["quote_sent"] ?? 0} delta="in play" href="/crm/leads?stage=quote_sent" icon="▤" seed={11} />
        <DeltaTile label="Won" value={counts["closed_won"] ?? 0} delta="became clients" href="/crm/leads?stage=closed_won" icon="◈" seed={5} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <BandCard title="Funnel" sub="every stage" className="lg:col-span-2">
          <FunnelChart stages={[
            { k: "New", v: counts["new"] ?? 0, c: "#8b7cf6", href: "/crm/leads?stage=new" },
            { k: "Contacted", v: counts["contacted"] ?? 0, c: "#a99df8", href: "/crm/leads?stage=contacted" },
            { k: "Quoted", v: counts["quote_sent"] ?? 0, c: "#e5b95e", href: "/crm/leads?stage=quote_sent" },
            { k: "Won", v: counts["closed_won"] ?? 0, c: "#4ade80", href: "/crm/leads?stage=closed_won" },
          ]} />
        </BandCard>
        <BandCard title="Flow" sub="leads per day · 14d" className="lg:col-span-3">
          <AreaChart points={dayCounts} height={120} label={`${wk} this week · ${pwk} last week`} />
        </BandCard>
      </div>

      <form className="mb-3"><input name="q" defaultValue={searchParams.q} placeholder="Search name, phone, or address…"
        className="w-full max-w-md rounded-xl border border-[color:var(--border)] bg-white/60 px-3 py-2 text-sm text-navy outline-none focus:border-teal dark:bg-white/10 dark:text-ice" /></form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/crm/leads" className={`rounded-full px-3 py-1 text-sm ${!searchParams.stage ? "bg-teal text-white" : "bg-white/60 text-slate dark:bg-white/10"}`}>All</Link>
        {STAGES.map((s) => (
          <Link key={s} href={`/crm/leads?stage=${s}`}
            className={`rounded-full px-3 py-1 text-sm ${searchParams.stage === s ? "bg-teal text-white" : "bg-white/60 text-slate dark:bg-white/10"}`}>
            {STAGE_LABEL[s]} <span className="opacity-60">{counts[s] ?? 0}</span>
          </Link>
        ))}
        <div className="ml-auto flex gap-1 rounded-full bg-ice/15 p-0.5 text-xs">
          <Link href={`/crm/leads${searchParams.stage ? `?stage=${searchParams.stage}` : ""}`} className={`rounded-full px-2.5 py-1 ${!kanban ? "bg-white text-navy dark:bg-white/20 dark:text-ice" : "text-slate"}`}>List</Link>
          <Link href={`/crm/leads?view=kanban${searchParams.stage ? `&stage=${searchParams.stage}` : ""}`} className={`rounded-full px-2.5 py-1 ${kanban ? "bg-white text-navy dark:bg-white/20 dark:text-ice" : "text-slate"}`}>Board</Link>
        </div>
      </div>

      {!leads?.length ? (
        <EmptyState title="No leads here yet" hint={searchParams.stage ? "Nothing in this stage right now." : "New quote requests land here the moment they come in."} action={<LinkButton href="/crm/leads?new=1">+ New lead</LinkButton>} />
      ) : kanban ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((st) => (
            <div key={st} className="min-w-0">
              <div className="mb-2 flex items-center gap-2 px-1"><Chip className={STAGE_STYLE[st]}>{STAGE_LABEL[st]}</Chip><span className="text-xs text-slate">{(leads ?? []).filter((l) => l.stage === st).length}</span></div>
              <div className="space-y-2">
                {(leads ?? []).filter((l) => l.stage === st).map((l) => (
                  <Link key={l.id} href={`/crm/leads/${l.id}`} className="mo-card block p-3 transition hover:shadow-pop">
                    <div className="font-medium text-navy dark:text-ice">{l.full_name ?? l.phone}</div>
                    <div className="text-xs text-slate">{l.city ?? "—"} · zone {l.zone_id ?? "?"}</div>
                    <div className="mt-1 text-[11px] text-slate/70">{ageLabel(l.created_at)}{l.quote_amount ? ` · $${l.quote_amount}` : ""}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mo-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[color:var(--border)] text-left text-slate">
              <th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Phone</th><th className="p-3 font-medium">City</th><th className="p-3 font-medium">Stage</th><th className="p-3 font-medium">Interest</th><th className="p-3 font-medium">Quote</th><th className="p-3 font-medium">Age</th>
            </tr></thead>
            <tbody>
              {(leads ?? []).map((l) => (
                <tr key={l.id} className="border-b border-[color:var(--border)] last:border-0 hover:bg-ice/10">
                  <td className="p-3"><Link className="font-medium text-teal hover:underline" href={`/crm/leads/${l.id}`}>{l.full_name ?? "—"}</Link></td>
                  <td className="p-3 text-slate">{l.phone}</td>
                  <td className="p-3 text-slate">{l.city ?? "—"}</td>
                  <td className="p-3"><Chip className={STAGE_STYLE[l.stage as StageKey]}>{STAGE_LABEL[l.stage as StageKey] ?? l.stage}</Chip></td>
                  <td className="p-3 text-slate">{l.service_interest ?? "—"}</td>
                  <td className="p-3 text-navy dark:text-ice">{l.quote_amount ? `$${l.quote_amount}` : "—"}</td>
                  <td className="p-3 text-slate/70">{ageLabel(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
