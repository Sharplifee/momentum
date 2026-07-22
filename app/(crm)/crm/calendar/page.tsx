import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MonthCalendar } from "@/components/crm/MonthCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { profile, role, db } = await requireStaff(["owner", "manager", "crew"]);
  const sp = await searchParams;

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? (sp.m as string) : todayIso.slice(0, 7);
  const [y, m] = month.split("-").map(Number);

  // fetch the whole 6-week grid window so leading/trailing days show their jobs too
  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setUTCDate(gridStart.getUTCDate() + 41);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let jobsQ = db
    .from("jobs")
    .select("id, scheduled_date, status, window_start, crew_id, weather_flag, properties(address), services(name), customers(full_name)")
    .gte("scheduled_date", fmt(gridStart))
    .lte("scheduled_date", fmt(gridEnd))
    .neq("status", "canceled");
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
    customer: j.customers?.full_name ?? "Customer",
    address: j.properties?.address ?? "",
    service: j.services?.name ?? "Service",
  }));

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Calendar</h1>
        <p className="mb-5 text-sm text-[color:var(--body)]">Every visit, every crew — tap a day for its route.</p>
        <MonthCalendar month={month} jobs={shaped} crews={(crews ?? []) as any} todayIso={todayIso} />
      </div>
    </Shell>
  );
}
