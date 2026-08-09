import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { Card, StatCard, PageHeader, Chip } from "@/components/ui";
import { STAGE_STYLE, STAGE_LABEL } from "@/lib/theme";
import Link from "next/link";
import { DeltaTile, FunnelChart, AreaChart, DonutChart, BandCard } from "@/components/crm/Charts";

/** Tiny deterministic sparkline like the Aivora cards. */
function Spark({ seed, up = true }: { seed: number; up?: boolean }) {
  const pts: number[] = [];
  let v = 30 + (seed % 20);
  for (let i = 0; i < 12; i++) { v += Math.sin((i + seed) * 1.7) * 8 + (up ? 1.5 : -1); pts.push(Math.max(6, Math.min(44, v))); }
  const d = pts.map((y, i) => `${i === 0 ? "M" : "L"}${(i * 100) / 11},${50 - y}`).join(" ");
  return (
    <svg viewBox="0 0 100 50" className="h-10 w-full" preserveAspectRatio="none">
      <defs><linearGradient id={`g${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7cf6" stopOpacity="0.35"/><stop offset="100%" stopColor="#8b7cf6" stopOpacity="0"/></linearGradient></defs>
      <path d={`${d} L100,50 L0,50 Z`} fill={`url(#g${seed})`} />
      <path d={d} fill="none" stroke="#a99df8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatTile({ label, value, sub, href, icon, seed }: { label: string; value: string | number; sub?: string; href?: string; icon: string; seed: number }) {
  const body = (
    <div className="mo-card aiv-glow flex flex-col gap-2 p-4 transition hover:shadow-glow">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal/15 text-base text-teal ring-1 ring-teal/25">{icon}</span>
        <span className="text-[13px] font-medium text-slate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="font-display text-[30px] font-bold leading-none text-navy">{value}</span>
        {sub && <span className="pb-1 text-[11px] font-medium text-green">{sub}</span>}
      </div>
      <Spark seed={seed} />
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}


export const dynamic = "force-dynamic";

/** Turn a raw automation/lead_event into a human sentence. */
function humanize(row: { trigger?: string; type?: string; detail?: any; actor?: string }): string {
  const t = row.trigger ?? row.type ?? "";
  const d = row.detail ?? {};
  if (t === "created" || t === "leads.create") return `New lead came in${d.zone_id ? ` in zone ${d.zone_id}` : ""}`;
  if (t.startsWith("stage.")) return `Lead moved to ${STAGE_LABEL[(t.split(".")[1] as keyof typeof STAGE_LABEL)] ?? t.split(".")[1]}`;
  if (t === "stage_change") return `Stage → ${STAGE_LABEL[(d.to as keyof typeof STAGE_LABEL)] ?? d.to}`;
  if (t === "wayne.book_job" || t === "job_booked") return `Wayne booked a visit${d.date ? ` for ${new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}`;
  if (t === "invoice.drafted") return `Invoice drafted${d.total ? ` — $${d.total}` : ""}`;
  if (t === "invoice.mark_paid" || t === "payments.paid") return `Payment received${d.amount ? ` — $${d.amount}` : ""}`;
  if (t === "wayne.escalate") return `Wayne handed a conversation to the team`;
  if (t === "note") return `Note: ${(d.note ?? "").slice(0, 60)}`;
  if (t === "reminder_sent") return `Day-before reminder sent`;
  return t.replace(/[._]/g, " ");
}

export default async function Dashboard() {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const weekEnd = new Date(new Date(todayIso + "T12:00:00").getTime() + 7 * 86400_000).toLocaleDateString("en-CA");
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [newL, contacted, quoted, won, wonJobs, resp, activity, checklist, weekJobs, custCount, leadSeries, srcRows, custSeries] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "new").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "contacted").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "quote_sent").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "closed_won").neq("source", "test"),
    db.from("jobs").select("price").eq("status", "completed").gte("created_at", weekAgo),
    db.from("leads").select("response_time_seconds").not("response_time_seconds", "is", null).gte("created_at", weekAgo),
    db.from("lead_events").select("type, detail, actor, created_at, lead_id").order("created_at", { ascending: false }).limit(12),
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
    db.from("jobs").select("id, scheduled_date, agreement_id, status, customers(full_name), crew_id").gte("scheduled_date", todayIso).lt("scheduled_date", weekEnd).neq("status", "cancelled").order("scheduled_date"),
    db.from("customers").select("id", { count: "exact", head: true }).neq("status", "opted_out"),
    db.from("leads").select("created_at").gte("created_at", twoWeeksAgo).neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%"),
    db.from("leads").select("source").neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%"),
    db.from("customers").select("created_at").gte("created_at", twoWeeksAgo),
  ]);
  const svcJobs = (weekJobs.data ?? []).filter((j: any) => j.agreement_id);
  const quoteVisits = (weekJobs.data ?? []).filter((j: any) => !j.agreement_id);
  // leads per day, last 14 days
  const dayCounts: number[] = Array.from({ length: 14 }, () => 0);
  for (const l of leadSeries.data ?? []) {
    const idx = 13 - Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400_000);
    if (idx >= 0 && idx < 14) dayCounts[idx]++;
  }
  const thisWk = dayCounts.slice(7).reduce((a, b) => a + b, 0);
  const prevWk = dayCounts.slice(0, 7).reduce((a, b) => a + b, 0);
  const wkDelta = prevWk ? Math.round(((thisWk - prevWk) / prevWk) * 100) : (thisWk ? 100 : 0);
  const srcAgg: Record<string, number> = {};
  for (const r of (srcRows.data ?? []) as any[]) srcAgg[r.source ?? "direct"] = (srcAgg[r.source ?? "direct"] ?? 0) + 1;
  const SRC_COLORS = ["#8b7cf6", "#e5b95e", "#4ade80", "#a5b0f0", "#e0655a"];
  const perDay = (rows: { scheduled_date?: string; created_at?: string }[], key: "scheduled_date" | "created_at", days = 14) => {
    const out = Array.from({ length: days }, () => 0);
    for (const r of rows) {
      const t = new Date((r as any)[key] + (key === "scheduled_date" ? "T12:00:00" : "")).getTime();
      const idx = days - 1 - Math.floor((Date.now() - t) / 86400_000);
      if (idx >= 0 && idx < days) out[idx]++;
    }
    return out;
  };
  const qvPts = perDay(quoteVisits as any, "scheduled_date", 7);
  const svPts = perDay(svcJobs as any, "scheduled_date", 7);
  const custPts = perDay((custSeries.data ?? []) as any, "created_at", 14);
  const srcSegs = Object.entries(srcAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v], i) => ({ k: k === "website" ? "Website" : k[0].toUpperCase() + k.slice(1), v, c: SRC_COLORS[i] }));

  const revenue = (wonJobs.data ?? []).reduce((s, j) => s + Number(j.price ?? 0), 0);
  const rts = (resp.data ?? []).map((l) => l.response_time_seconds as number);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length / 60) : null;

  // pipeline bar (teal scale)
  const byStage: Record<string, number> = { new: newL.count ?? 0, contacted: contacted.count ?? 0, quote_sent: quoted.count ?? 0, closed_won: won.count ?? 0 };
  const maxStage = Math.max(1, ...Object.values(byStage));

  const stats = [
    { label: "Incoming Leads", value: newL.count ?? 0, delta: `${wkDelta >= 0 ? "+" : ""}${wkDelta}% vs last wk`, up: wkDelta >= 0, href: "/crm/leads?stage=new", icon: "◎", seed: 3, points: dayCounts },
    { label: "Quote Visits", value: quoteVisits.length, delta: "next 7 days", href: "/crm/schedule", icon: "▤", seed: 11, points: qvPts },
    { label: "Service Visits", value: svcJobs.length, delta: "next 7 days", href: "/crm/schedule", icon: "✓", seed: 7, points: svPts },
    { label: "Total Clients", value: custCount.count ?? 0, delta: "accounts", href: "/crm/customers", icon: "◈", seed: 5, points: custPts },
  ];

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Dashboard</div>
      <PageHeader title={`Welcome back, ${(profile.full_name ?? "").split(" ")[0]}`} action={<Link href="/crm/leads" className="mo-primary rounded-xl px-4 py-2 text-sm font-medium shadow-card">View pipeline →</Link>} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => <DeltaTile key={s.label} {...s} />)}
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-5">
        <BandCard title="Leads by stage" sub="pipeline funnel" className="lg:col-span-2">
          <FunnelChart stages={[
            { k: "New", v: byStage.new, c: "#8b7cf6", href: "/crm/leads?stage=new" },
            { k: "Contacted", v: byStage.contacted, c: "#a99df8", href: "/crm/leads?stage=contacted" },
            { k: "Quoted", v: byStage.quote_sent, c: "#e5b95e", href: "/crm/leads?stage=quote_sent" },
            { k: "Won", v: byStage.closed_won, c: "#4ade80", href: "/crm/leads?stage=closed_won" },
          ]} />
        </BandCard>
        <BandCard title="Leads over time" sub="last 14 days" className="lg:col-span-3">
          <AreaChart points={dayCounts} height={130} label={`${dayCounts.reduce((a, b) => a + b, 0)} total · ${thisWk} this week vs ${prevWk} last week`} />
        </BandCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <BandCard title="Leads by source" sub="where they find you" className="lg:col-span-2">
          {srcSegs.length ? <DonutChart segs={srcSegs} /> : <p className="py-6 text-sm text-[color:var(--body)]">Sources appear as leads arrive.</p>}
          <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-sm">
            <span className="text-[color:var(--body)]">Avg first response</span>
            <span className="font-display text-xl font-bold text-[color:var(--ink)]">{avgResp != null ? `${avgResp}m` : "—"}</span>
          </div>
        </BandCard>
        <BandCard title="Live activity" sub="as it happens" className="lg:col-span-3">
          <div className="space-y-1">
            {(activity.data ?? []).slice(0, 7).map((a, i) => (
              <Link key={i} href={a.lead_id ? `/crm/leads/${a.lead_id}` : "/crm/messages"}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-white/[0.02] px-3 py-2.5 text-sm transition hover:border-teal/40 hover:bg-teal/[0.06]">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  <span className="truncate text-navy dark:text-ice">{humanize(a)}</span>
                </span>
                <span className="shrink-0 pl-3 text-xs text-slate/70">{new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </Link>
            ))}
            {!activity.data?.length && <p className="py-6 text-center text-sm text-slate">Quiet so far — new activity shows up here.</p>}
          </div>
        </BandCard>
      </div>
    </Shell>
  );
}
