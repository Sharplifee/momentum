import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { STAGE_COLOR, SERIES } from "@/lib/theme";
import { Tile, CompareBars, DayStrip, TrendLine, HBars, BandCard } from "@/components/crm/Charts";
import { WeekStrip, type WeekDay } from "@/components/crm/WeekStrip";
import { HealthCard } from "@/components/crm/HealthCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Turn a raw automation/lead_event into a human sentence. */

export default async function Dashboard() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const weekEnd = new Date(new Date(todayIso + "T12:00:00").getTime() + 7 * 86400_000).toLocaleDateString("en-CA");
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [summary, wonJobs, resp, checklist, weekJobs, custCount, leadSeries, srcRows, custSeries] = await Promise.all([
    // Four separate counts of the same table became one grouped query inside
    // Postgres. Each round trip was costing more than the query itself.
    db.rpc("momentum_dashboard_summary"),
    db.from("jobs").select("price").eq("status", "completed").gte("created_at", weekAgo),
    db.from("leads").select("response_time_seconds").not("response_time_seconds", "is", null).gte("created_at", weekAgo),
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
    db.from("jobs").select("id, scheduled_date, agreement_id, status, crew_id, window_start, weather_flag, customers(full_name), services(name), properties(city)").gte("scheduled_date", todayIso).lt("scheduled_date", weekEnd).neq("status", "cancelled").order("scheduled_date").order("window_start", { ascending: true, nullsFirst: false }),
    db.from("customers").select("id", { count: "exact", head: true }).neq("status", "opted_out"),
    db.from("leads").select("created_at").gte("created_at", twoWeeksAgo).neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%"),
    db.from("leads").select("source").neq("source", "test").not("full_name", "ilike", "zz %").not("phone", "like", "+1555%"),
    db.from("customers").select("created_at").gte("created_at", twoWeeksAgo),
  ]);
  const svcJobs = (weekJobs.data ?? []).filter((j: any) => j.agreement_id);
  const quoteVisits = (weekJobs.data ?? []).filter((j: any) => !j.agreement_id);
  // Seven-day view: one entry per day from today, stops in window order.
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(new Date(todayIso + "T12:00:00").getTime() + i * 86400_000);
    const iso = d.toLocaleDateString("en-CA");
    const rows = ((weekJobs.data ?? []) as any[]).filter((j) => j.scheduled_date === iso);
    return {
      iso, label: d.toLocaleDateString("en-US", { weekday: "short" }), num: d.getDate(),
      svc: rows.filter((j) => j.agreement_id).length, quote: rows.filter((j) => !j.agreement_id).length,
      rain: rows.some((j) => j.weather_flag), off: d.getDay() === 0,
      stops: rows.map((j) => ({ id: j.id, time: j.window_start ?? null, name: j.customers?.full_name ?? "Customer", service: j.services?.name ?? "Visit", city: j.properties?.city ?? null, quote: !j.agreement_id })),
    };
  });
  // leads per day, last 14 days
  const dayCounts: number[] = Array.from({ length: 14 }, () => 0);
  for (const l of leadSeries.data ?? []) {
    const idx = 13 - Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400_000);
    if (idx >= 0 && idx < 14) dayCounts[idx]++;
  }
  const thisWk = dayCounts.slice(7).reduce((a, b) => a + b, 0);
  const prevWk = dayCounts.slice(0, 7).reduce((a, b) => a + b, 0);
  const S = (summary as any)?.data ?? {};
  const stageCount = (k: string) => Number(S.stages?.[k] ?? 0);
  const stale = stageCount("stale");
  const lost = stageCount("not_qualified");
  const totalLeads = Object.values((S.stages ?? {}) as Record<string, number>).reduce((a, b) => a + Number(b), 0);
  const newL = { count: stageCount("new") };
  const contacted = { count: stageCount("contacted") };
  const quoted = { count: stageCount("quote_sent") };
  const won = { count: stageCount("closed_won") };

  const wkDelta = prevWk ? Math.round(((thisWk - prevWk) / prevWk) * 100) : (thisWk ? 100 : 0);
  const srcAgg: Record<string, number> = {};
  for (const r of (srcRows.data ?? []) as any[]) srcAgg[r.source ?? "direct"] = (srcAgg[r.source ?? "direct"] ?? 0) + 1;
  const SRC_COLORS = SERIES;
  // Past series (customers added) bucket backwards from now; scheduled visits
  // bucket FORWARD from today, one slot per calendar day in Denver.
  const perDayPast = (rows: { created_at?: string }[], days = 14) => {
    const out = Array.from({ length: days }, () => 0);
    for (const r of rows) {
      const idx = days - 1 - Math.floor((Date.now() - new Date(r.created_at as string).getTime()) / 86400_000);
      if (idx >= 0 && idx < days) out[idx]++;
    }
    return out;
  };
  const todayNoon = new Date(todayIso + "T12:00:00").getTime();
  const perDayAhead = (rows: { scheduled_date?: string }[], days = 7) => {
    const out = Array.from({ length: days }, () => 0);
    for (const r of rows) {
      const idx = Math.round((new Date(r.scheduled_date + "T12:00:00").getTime() - todayNoon) / 86400_000);
      if (idx >= 0 && idx < days) out[idx]++;
    }
    return out;
  };
  const dayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(todayNoon + i * 86400_000).toLocaleDateString("en-US", { timeZone: "America/Denver", weekday: "narrow" }));
  const qvPts = perDayAhead(quoteVisits as any);
  const svPts = perDayAhead(svcJobs as any);
  const custPts = perDayPast((custSeries.data ?? []) as any, 14);
  const custMonth = (custSeries.data ?? []).length;
  const srcSegs = Object.entries(srcAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v], i) => ({ k: k === "website" ? "Website" : k[0].toUpperCase() + k.slice(1), v, c: SRC_COLORS[i] }));

  const revenue = (wonJobs.data ?? []).reduce((s, j) => s + Number(j.price ?? 0), 0);
  const rts = (resp.data ?? []).map((l) => l.response_time_seconds as number);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length / 60) : null;

  // pipeline bar (teal scale)
  const byStage: Record<string, number> = { new: newL.count ?? 0, contacted: contacted.count ?? 0, quote_sent: quoted.count ?? 0, closed_won: won.count ?? 0 };


  // Needs-you list: escalated threads + new leads with no first_response_at
  const [{ data: threads }, { data: nyLeads }, { data: todayLeads }, { data: todayJobs }] = await Promise.all([
    db.from("threads").select("id, phone, last_message_at, escalated, lead_id, leads(full_name, city)").eq("escalated", true).order("last_message_at", { ascending: false }).limit(6),
    db.from("leads").select("id, full_name, city, created_at").eq("stage", "new").is("first_response_at", null).order("created_at").limit(6),
    db.from("leads").select("id, full_name, city, quote_visit_date, quote_visit_window").eq("quote_visit_date", todayIso).order("quote_visit_window"),
    db.from("jobs").select("id, scheduled_date, window_start, status, customers(full_name), properties(city)").eq("scheduled_date", todayIso).neq("status", "cancelled").order("window_start", { ascending: true }),
  ]);
  const needs = [
    ...(threads ?? []).map((t: any) => ({ k: `t-${t.id}`, name: t.leads?.full_name ?? t.phone, city: t.leads?.city ?? null, href: `/crm/messages?thread=${t.id}`, action: "Open", age: t.last_message_at })),
    ...(nyLeads ?? []).map((l: any) => ({ k: `l-${l.id}`, name: l.full_name ?? "Lead", city: l.city, href: `/crm/leads/${l.id}`, action: "Reply", age: l.created_at })),
  ].slice(0, 6);

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <PageHeader
        eyebrow={`Dashboard · ${new Date().toLocaleDateString("en-US", { timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric" })}`}
        title={`Welcome back, ${(profile.full_name ?? "").split(" ")[0]}`}
      />

      {/* Four tiles, four different pictures. Titles are one or two words so
          they never wrap at phone width; the period lives next to the number. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Leads" value={totalLeads} note={thisWk ? `${thisWk} this week` : `${newL.count} new`} href="/crm/leads">
          <CompareBars a={thisWk} b={prevWk} />
        </Tile>
        <Tile label="Clients" value={custCount.count ?? 0} note={custMonth ? `+${custMonth} in 14 d` : "accounts"} href="/crm/customers">
          <TrendLine points={custPts} label="Clients added over the last 14 days" />
        </Tile>
        <Tile label="Service visits" value={svcJobs.length} note="next 7 days" href="/crm/schedule">
          <DayStrip counts={svPts} labels={dayLabels} title="Service visits by day" />
        </Tile>
        <Tile label="Quote visits" value={quoteVisits.length} note="next 7 days" href="/crm/schedule">
          <DayStrip counts={qvPts} labels={dayLabels} title="Quote visits by day" />
        </Tile>
      </div>

      {/* Two bands, as designed: the pipeline by stage, then what just happened. */}
      <div className="grid gap-5 lg:grid-cols-5">
        <BandCard title="Leads by stage" sub={`Pipeline · ${totalLeads} total`} className="lg:col-span-2">
          <HBars rows={[
            { k: "New", v: byStage.new, c: STAGE_COLOR.new },
            { k: "Contacted", v: byStage.contacted, c: STAGE_COLOR.contacted },
            { k: "Quoted", v: byStage.quote_sent, c: STAGE_COLOR.quote_sent },
            { k: "Won", v: byStage.closed_won, c: STAGE_COLOR.closed_won },
            ...(stale ? [{ k: "Stale", v: stale, c: "#66635c" }] : []),
            ...(lost ? [{ k: "Not qualified", v: lost, c: "#d9775c" }] : []),
          ]} />
          <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-sm">
            <span className="text-[color:var(--body)]">Avg first response</span>
            <span className="mo-num text-xl font-semibold text-[color:var(--ink)]">{avgResp != null ? `${avgResp}m` : "—"}</span>
          </div>
        </BandCard>
        <div className="min-w-0 lg:col-span-3"><WeekStrip days={week} todayIso={todayIso} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="mo-card lg:col-span-3 p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Needs you</div>
            <Link href="/crm/leads" className="mo-eyebrow text-teal">View all</Link>
          </div>
          {needs.map((n) => (
            <Link key={n.k} href={n.href} className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-4 py-3 transition hover:bg-white/[0.03]">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[color:var(--ink)]">{n.name}</div>
                {n.city && <div className="truncate text-[12px] text-[color:var(--body)]">{n.city}</div>}
              </div>
              <span className="mo-eyebrow rounded-full border border-teal/50 px-2 py-0.5 text-teal">{n.action}</span>
            </Link>
          ))}
          {!needs.length && <p className="px-4 py-4 text-[13px] text-[color:var(--body)]">Nobody is waiting on you.</p>}
        </div>
        <div className="mo-card p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Today</div>
            <Link href="/crm/schedule" className="mo-eyebrow text-teal">Open schedule</Link>
          </div>
          {[...(todayLeads ?? []).map((l: any) => ({ k: `ql-${l.id}`, label: "Quote visit", name: l.full_name ?? "Lead", sub: `${l.city ?? ""} · ${l.quote_visit_window ?? ""}` })),
            ...(todayJobs ?? []).map((j: any) => ({ k: `j-${j.id}`, label: j.status === "scheduled" ? "Scheduled" : j.status, name: j.customers?.full_name ?? "Customer", sub: `${j.properties?.city ?? ""} · ${j.window_start ?? ""}` }))
          ].map((r) => (
            <div key={r.k} className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[color:var(--ink)]">{r.name}</div>
                <div className="truncate text-[12px] text-[color:var(--body)]">{r.sub}</div>
              </div>
              <span className="mo-eyebrow rounded-full border border-[color:var(--border)] px-2 py-0.5">{r.label}</span>
            </div>
          ))}
          {!((todayLeads ?? []).length || (todayJobs ?? []).length) && <p className="px-4 py-4 text-[13px] text-[color:var(--body)]">Nothing booked today.</p>}
        </div>
      </div>

      <div className="mt-5">
        <HealthCard />
      </div>
    </Shell>
  );
}
