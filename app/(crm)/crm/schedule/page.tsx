import { smsPausedReason } from "@/lib/smsStatus";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MonthCalendar } from "@/components/crm/MonthCalendar";
import { BandCard, Tile } from "@/components/crm/Charts";
import { WeekBoard } from "@/components/crm/WeekBoard";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { NewJobButton } from "@/components/crm/NewJobSheet";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  // Auth and the URL params do not depend on each other, so waiting for one
  // then the other cost a round trip for nothing.
  const [{ profile, role, realRole, previewing, db }, sp] = await Promise.all([
    requireStaff(["owner", "manager", "crew"]),
    searchParams,
  ]);

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const smsPaused = await smsPausedReason(db);
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
  const [{ data: jobs }, { data: crews }, { data: services }] = await Promise.all([
    jobsQ,
    db.from("crews").select("id, name, max_daily_jobs").eq("active", true).order("id"),
    db.from("services").select("id, name, recurring").eq("active", true).order("id"),
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
  const svcToday = service.filter((j) => j.scheduled_date === todayIso);
  const qToday = quotes.filter((j) => j.scheduled_date === todayIso);

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <PageHeader eyebrow="Operations" title="Schedule" />

        {/* Two tiles, titles short enough never to wrap on a phone; today's
            count sits next to the week's number instead of in its own cell. */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Tile label="Service visits" value={svcWeek.length} note={`this week · ${svcToday.length} today`} />
          <Tile label="Quote visits" value={qWeek.length} note={`this week · ${qToday.length} today`} />
        </div>

        <BandCard title="This week" sub={`${week[0].dow} ${week[0].num} → ${week[4].dow} ${week[4].num}`} className="mb-6">
          <WeekBoard week={week} service={service} quotes={quotes} todayIso={todayIso} />
        </BandCard>

        {/* One calendar: service visits as glacier dots, quote visits amber,
            month arrows on the left, "+ Job" on the right — as designed. */}
        <MonthCalendar
          month={month}
          jobs={shaped as any}
          crews={(crews ?? []) as any}
          todayIso={todayIso}
          selectedIso={/^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d : undefined}
          basePath="/crm/schedule?"
          action={role !== "crew" ? <NewJobButton services={(services ?? []) as any} crews={(crews ?? []) as any} defaultDate={todayIso} smsPaused={smsPaused} /> : undefined}
        />
      </div>
    </Shell>
  );
}
