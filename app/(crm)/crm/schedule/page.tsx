import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MonthCalendar } from "@/components/crm/MonthCalendar";
import { DeltaTile, BandCard } from "@/components/crm/Charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const { profile, role, db } = await requireStaff(["owner", "manager", "crew"]);
  const sp = await searchParams;

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? (sp.m as string) : todayIso.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setUTCDate(gridStart.getUTCDate() + 41);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const weekStart = new Date(todayIso + "T12:00:00");
  const rangeStart = fmt(new Date(Math.min(gridStart.getTime(), weekStart.getTime())));
  const rangeEnd = fmt(new Date(Math.max(gridEnd.getTime(), weekStart.getTime() + 6 * 86400_000)));

  let jobsQ = db
    .from("jobs")
    .select("id, scheduled_date, status, window_start, crew_id, weather_flag, agreement_id, properties(address), services(name), customers(full_name)")
    .gte("scheduled_date", rangeStart)
    .lte("scheduled_date", rangeEnd)
    .neq("status", "cancelled");
  if (role === "crew") {
    const { data: myCrew } = await db.from("crews").select("id").eq("lead_profile", profile.id).maybeSingle();
    if (myCrew) jobsQ = jobsQ.eq("crew_id", myCrew.id);
  }
  const [{ data: jobs }, { data: crews }] = await Promise.all([
    jobsQ,
    db.from("crews").select("id, name, max_daily_jobs").eq("active", true).order("id"),
  ]);

  const shaped = (jobs ?? []).map((j: any) => ({
    id: j.id,
    scheduled_date: j.scheduled_date,
    status: j.status,
    window_start: j.window_start,
    crew_id: j.crew_id,
    weather_flag: j.weather_flag,
    kind: j.agreement_id ? "service" : "quote",
    customer: j.customers?.full_name ?? "Customer",
    address: j.properties?.address ?? "",
    service: j.agreement_id ? (j.services?.name ?? "Service") : "Quote visit",
  }));
  const service = shaped.filter((j) => j.kind === "service");
  const quotes = shaped.filter((j) => j.kind === "quote");

  // Five days, starting today. Seven columns on a phone leaves each one too
  // narrow to read; five gives every day room for real names.
  const week = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * 86400_000);
    return {
      iso: d.toLocaleDateString("en-CA"),
      dow: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
    };
  });
  const weekIsos = week.map((w) => w.iso);
  const svcWeek = service.filter((j) => weekIsos.includes(j.scheduled_date));
  const qWeek = quotes.filter((j) => weekIsos.includes(j.scheduled_date));
  const todayJobs = shaped.filter((j) => j.scheduled_date === todayIso);
  const svcToday = service.filter((j) => j.scheduled_date === todayIso);
  const qToday = quotes.filter((j) => j.scheduled_date === todayIso);
  const svcPts = week.map((w) => service.filter((j) => j.scheduled_date === w.iso).length);
  const qPts = week.map((w) => quotes.filter((j) => j.scheduled_date === w.iso).length);
  const capacity = (crews ?? []).reduce((s, c) => s + (c.max_daily_jobs ?? 12), 0) * 7 || 1;
  const util = Math.round((svcWeek.length / capacity) * 100);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Schedule</h1>
        <p className="mb-5 text-sm text-[color:var(--body)]">
          Both calendars, always visible — <span className="font-medium text-teal">service visits</span> and <span className="font-medium text-gold">quote visits</span>.
        </p>

        {/* One strip rather than four tiles: the only numbers that matter here are
            how much work there is this week and how much of it is today. */}
        <div className="mo-card mb-6 grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4">
          <div>
            <div className="font-display text-[34px] font-bold leading-none text-teal">{svcWeek.length}</div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--body)]">Service · week</div>
          </div>
          <div>
            <div className="font-display text-[34px] font-bold leading-none text-[color:var(--ink)]">{svcToday.length}</div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--body)]">Service · today</div>
          </div>
          <div>
            <div className="font-display text-[34px] font-bold leading-none text-gold">{qWeek.length}</div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--body)]">Quotes · week</div>
          </div>
          <div>
            <div className="font-display text-[34px] font-bold leading-none text-[color:var(--ink)]">{qToday.length}</div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--body)]">Quotes · today</div>
          </div>
        </div>

        <BandCard title="This week" sub={`${week[0].dow} ${week[0].num} → ${week[4].dow} ${week[4].num} · teal = service · gold = quote`} className="mb-6">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {week.map((d) => {
              const svc = service.filter((j) => j.scheduled_date === d.iso);
              const qts = quotes.filter((j) => j.scheduled_date === d.iso);
              const isToday = d.iso === todayIso;
              return (
                <Link key={d.iso} href={`/crm/schedule?m=${d.iso.slice(0, 7)}&d=${d.iso}`}
                  className={`min-h-[150px] rounded-2xl border p-2 transition hover:border-teal/50 sm:min-h-[170px] ${isToday ? "border-teal/60 bg-teal/[0.08] shadow-glow" : "border-[color:var(--border)] bg-white/[0.02]"}`}>
                  <div className="mb-1.5 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--body)]/70">{d.dow}</div>
                    <div className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-[15px] font-bold ${isToday ? "bg-teal text-white" : "text-[color:var(--ink)]"}`}>{d.num}</div>
                  </div>
                  <div className="space-y-1">
                    {svc.slice(0, 3).map((j) => (
                      <div key={j.id} title={j.customer} className="truncate rounded-md bg-teal/20 px-1.5 py-1 text-[10px] font-medium leading-tight text-teal ring-1 ring-teal/25">{j.customer}</div>
                    ))}
                    {qts.slice(0, 3).map((j) => (
                      <div key={j.id} title={j.customer} className="truncate rounded-md bg-gold/20 px-1.5 py-1 text-[10px] font-medium leading-tight text-gold ring-1 ring-gold/30">{j.customer}</div>
                    ))}
                    {svc.length + qts.length === 0 && <div className="pt-2 text-center text-[10px] text-[color:var(--body)]/40">—</div>}
                    {svc.length + qts.length > 6 && <div className="text-center text-[10px] text-[color:var(--body)]/60">+{svc.length + qts.length - 6} more</div>}
                  </div>
                </Link>
              );
            })}
          </div>
        </BandCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-teal" />
              <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Service calendar</h2>
              <span className="text-[11px] text-[color:var(--body)]/70">active client visits</span>
            </div>
            <MonthCalendar month={month} jobs={service as any} crews={(crews ?? []) as any} todayIso={todayIso} basePath="/crm/schedule?" />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gold" />
              <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Quote visits calendar</h2>
              <span className="text-[11px] text-[color:var(--body)]/70">new-business appointments</span>
            </div>
            <MonthCalendar month={month} jobs={quotes as any} crews={(crews ?? []) as any} todayIso={todayIso} basePath="/crm/schedule?" />
          </div>
        </div>
      </div>
    </Shell>
  );
}
