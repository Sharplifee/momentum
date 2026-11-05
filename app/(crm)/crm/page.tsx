import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { STAGE_COLOR, SERIES } from "@/lib/theme";
import { Tile, CompareBars, DayStrip, TrendLine, HBars, BandCard } from "@/components/crm/Charts";
import { WeekStrip, type WeekDay } from "@/components/crm/WeekStrip";

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
    </Shell>
  );
}
