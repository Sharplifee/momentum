import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MonthCalendar } from "@/components/crm/MonthCalendar";
import Link from "next/link";

export const dynamic = "force-dynamic";

const LANES = [
  { key: "all", label: "All" },
  { key: "service", label: "Service" },
  { key: "quotes", label: "Quote visits" },
] as const;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ m?: string; lane?: string }> }) {
  const { profile, role, db } = await requireStaff(["owner", "manager", "crew"]);
  const sp = await searchParams;
  const lane = (sp.lane ?? "all") as (typeof LANES)[number]["key"];

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? (sp.m as string) : todayIso.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setUTCDate(gridStart.getUTCDate() + 41);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let jobsQ = db
    .from("jobs")
    .select("id, scheduled_date, status, window_start, crew_id, weather_flag, agreement_id, properties(address), services(name), customers(full_name)")
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

  const shapedAll = (jobs ?? []).map((j: any) => ({
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
  const shaped = lane === "all" ? shapedAll : shapedAll.filter((j) => (lane === "service" ? j.kind === "service" : j.kind === "quote"));

  const weekFromToday = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(new Date(todayIso + "T12:00:00").getTime() + i * 86400_000);
    return d.toLocaleDateString("en-CA");
  });
  const svcWeek = shapedAll.filter((j) => j.kind === "service" && weekFromToday.includes(j.scheduled_date)).length;
  const qWeek = shapedAll.filter((j) => j.kind === "quote" && weekFromToday.includes(j.scheduled_date)).length;

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Scheduling</div>
        <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Schedule</h1>
        <p className="mb-4 text-sm text-[color:var(--body)]">
          Two calendars, one view — <span className="text-teal">service visits</span> for active clients and <span className="text-gold">quote visits</span> for new business.
          Next 7 days: {svcWeek} service · {qWeek} quotes.
        </p>

        <div className="mb-4 inline-flex gap-1 rounded-xl bg-white/[0.06] p-1">
          {LANES.map((l) => (
            <Link
              key={l.key}
              href={`/crm/schedule?m=${month}&lane=${l.key}`}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${lane === l.key ? "bg-teal/20 text-navy ring-1 ring-teal/40" : "text-[color:var(--body)] hover:text-[color:var(--ink)]"}`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <MonthCalendar month={month} jobs={shaped as any} crews={(crews ?? []) as any} todayIso={todayIso} basePath={`/crm/schedule?lane=${lane}&`} />
      </div>
    </Shell>
  );
}
