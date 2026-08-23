import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { TodayStops } from "@/components/crm/TodayStops";

export const dynamic = "force-dynamic";

/**
 * The crew's day.
 *
 * This was a raw ISO date and a list. A crew member opens this in a truck at
 * 7am wanting three things before they touch anything: what the weather is
 * doing to the lawns, how much work today is, and where they are going first.
 * The header answers all three without scrolling.
 */
export default async function Today() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager", "crew"]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  let crewIds: number[] = [];
  if (role === "crew") {
    const { data: cm } = await db.from("crew_members").select("crew_id").eq("profile_id", profile.id);
    crewIds = (cm ?? []).map((c) => c.crew_id);
  }
  let q = db.from("jobs")
    .select("id, status, arrival_at, departure_at, window_start, notes, weather_flag, price, properties(address, city, gate_code, pets, access_notes, gate_width_in, has_dog, obstacles, lat, lng), services(name), customers(full_name)")
    .eq("scheduled_date", today).neq("status", "cancelled")
    .order("window_start", { ascending: true, nullsFirst: false });
  if (role === "crew" && crewIds.length) q = q.in("crew_id", crewIds);
  const { data: jobs } = await q;

  const list = jobs ?? [];
  const done = list.filter((j: any) => j.departure_at).length;
  const first = list.find((j: any) => !j.departure_at) as any;

  // Weather for the first stop, because that is the lawn they are about to
  // stand on — not a city average.
  let wx: any = null;
  const p = first?.properties;
  if (p?.lat && p?.lng) {
    try {
      const r = await fetch(
        `https://crm.momentumlandscapingut.com/api/weather?lat=${p.lat}&lng=${p.lng}`,
        { next: { revalidate: 900 } }
      );
      if (r.ok) wx = await r.json();
    } catch { /* the day still works without it */ }
  }

  const d = new Date(today + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const datePart = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const hour = new Date().toLocaleString("en-US", { timeZone: "America/Denver", hour: "numeric", hour12: false });
  const greet = Number(hour) < 12 ? "Morning" : Number(hour) < 17 ? "Afternoon" : "Evening";
  const firstName = (profile.full_name ?? "").trim().split(" ")[0];

  const day = wx?.days?.[0];
  const rain = day?.precipitationChance ?? null;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing}
           name={profile.full_name ?? ""} email={profile.email ?? undefined}>

      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">
          {weekday} · {datePart}
        </p>
        <h1 className="mt-1 font-display text-[30px] font-bold leading-none tracking-tight text-[color:var(--ink)] md:text-[36px]">
          {greet}{firstName ? `, ${firstName}` : ""}
        </h1>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {/* the work */}
          <div className="mo-card flex items-center gap-4 p-4">
            <div className="relative grid h-14 w-14 shrink-0 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 h-14 w-14 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#7FB8BE" strokeWidth="4"
                        strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} />
              </svg>
              <span className="font-display text-[15px] font-bold">{done}</span>
            </div>
            <div className="min-w-0">
              <div className="font-display text-xl leading-tight">
                {list.length === 0 ? "Nothing today" : `${list.length - done} left`}
              </div>
              <div className="text-[13px] text-[color:var(--body)]">
                {list.length ? `${done} of ${list.length} done` : "Enjoy it"}
              </div>
            </div>
          </div>

          {/* the sky */}
          <div className="mo-card flex items-center gap-4 p-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ice/15 text-2xl">
              {rain !== null && rain >= 50 ? "🌧" : rain !== null && rain >= 25 ? "🌦" : "☀️"}
            </div>
            <div className="min-w-0">
              <div className="font-display text-xl leading-tight">
                {day?.highF != null ? `${Math.round(day.highF)}°` : "—"}
                {day?.lowF != null && (
                  <span className="ml-1.5 text-[15px] font-normal text-[color:var(--body)]">
                    / {Math.round(day.lowF)}°
                  </span>
                )}
              </div>
              <div className="text-[13px] text-[color:var(--body)]">
                {rain === null ? "Weather unavailable"
                  : rain >= 50 ? `${rain}% rain — grass will be wet`
                  : rain >= 25 ? `${rain}% chance of rain`
                  : "Clear for mowing"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <TodayStops jobs={list as any} />
    </Shell>
  );
}
