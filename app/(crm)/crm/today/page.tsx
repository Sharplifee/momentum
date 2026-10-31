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
  const { data: photoRows } = list.length
    ? await db.from("job_events").select("job_id, photo_url").eq("type", "photo").in("job_id", list.map((j: any) => j.id))
    : { data: [] as { job_id: string; photo_url: string | null }[] };
  const photosByJob: Record<string, string[]> = {};
  for (const r of photoRows ?? []) {
    if (!r.photo_url) continue;
    const { data: signed } = await db.storage.from("job-photos").createSignedUrl(r.photo_url, 3600);
    if (signed?.signedUrl) (photosByJob[r.job_id] ??= []).push(signed.signedUrl);
  }
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

  return (
    <Shell role={role} realRole={realRole} previewing={previewing}
           name={profile.full_name ?? ""} email={profile.email ?? undefined}>

      <header className="mb-5">
        <p className="mo-eyebrow">{weekday} · {datePart}</p>
        <h1 className="mo-h1 mt-2 text-[30px] md:text-[36px]">
          {greet}{firstName ? `, ${firstName}` : ""}
        </h1>
        <div className="mo-hairline-soft mt-4" />

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {/* the work — one dot per stop, filled as they finish */}
          <div className="mo-card flex items-center gap-4 p-4">
            <div className="shrink-0">
              <div className="flex max-w-[84px] flex-wrap gap-1">
                {Array.from({ length: Math.max(list.length, 1) }).slice(0, 12).map((_, i) => (
                  <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${list.length === 0 ? "bg-white/10" : i < done ? "bg-teal" : "bg-white/15"}`} />
                ))}
              </div>
              <div className="mo-eyebrow mt-1.5">Stops</div>
            </div>
            <div className="min-w-0">
              <div className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ink)]">
                {list.length === 0 ? "Nothing today" : `${list.length - done} left`}
              </div>
              <div className="text-[13px] text-[color:var(--body)]">
                {list.length ? `${done} of ${list.length} done` : "Enjoy it"}
              </div>
            </div>
          </div>

          {/* the sky */}
          <div className="mo-card flex items-center gap-4 p-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-[color:var(--border)] text-[color:var(--ink)]">
              {rain !== null && rain >= 50 ? (
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7 15a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 8.5a3.5 3.5 0 0 1-.5 6.96H7z"/><path d="M8 18v2M12 18v3M16 18v2"/></svg>
              ) : rain !== null && rain >= 25 ? (
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7 15a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 8.5a3.5 3.5 0 0 1-.5 6.96H7z"/><path d="M10 18v2"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ink)]">
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

      <TodayStops jobs={list as any} photos={photosByJob} />
    </Shell>
  );
}
