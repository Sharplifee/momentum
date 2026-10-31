import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { TodayStops } from "@/components/crm/TodayStops";
import Link from "next/link";

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

  // Next route (for the empty state) and today's wrap-up numbers (for the done state).
  const allDone = list.length > 0 && done === list.length;
  let nextRoute: { iso: string; n: number; start: string | null; city: string | null } | null = null;
  if (!list.length || allDone) {
    let nq = db.from("jobs").select("scheduled_date, window_start, properties(city)").gt("scheduled_date", today).neq("status", "cancelled").order("scheduled_date").order("window_start", { nullsFirst: false }).limit(40);
    if (role === "crew" && crewIds.length) nq = nq.in("crew_id", crewIds);
    const { data: upcoming } = await nq;
    const firstUp: any = upcoming?.[0];
    if (firstUp) {
      const sameDay = (upcoming ?? []).filter((u: any) => u.scheduled_date === firstUp.scheduled_date);
      nextRoute = { iso: firstUp.scheduled_date, n: sameDay.length, start: firstUp.window_start, city: firstUp.properties?.city ?? null };
    }
  }
  const { count: waitingOnHuman } = await db.from("threads").select("id", { count: "exact", head: true }).eq("escalated", true);
  let wrap: { verified: number; minutes: number; clockedOut: string | null; avg: number | null; photos: number; flags: number } | null = null;
  if (allDone) {
    const ids = list.map((j: any) => j.id);
    const [{ data: ops }, { count: photoCount }, { count: flagCount }] = await Promise.all([
      db.from("v_ops_today").select("job_id, gps_verified, minutes_on_site").in("job_id", ids),
      db.from("job_events").select("id", { count: "exact", head: true }).eq("type", "photo").in("job_id", ids),
      db.from("exceptions").select("id", { count: "exact", head: true }).in("job_id", ids),
    ]);
    const mins = list.map((j: any) => j.arrival_at && j.departure_at ? Math.max(1, Math.round((new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 60000)) : 0);
    const total = mins.reduce((a, b) => a + b, 0);
    const lastOut = list.map((j: any) => j.departure_at).filter(Boolean).sort().slice(-1)[0];
    wrap = {
      verified: (ops ?? []).filter((o: any) => o.gps_verified).length,
      minutes: total,
      clockedOut: lastOut ? new Date(lastOut).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }) : null,
      avg: mins.filter(Boolean).length ? Math.round(total / mins.filter(Boolean).length) : null,
      photos: photoCount ?? 0,
      flags: (flagCount ?? 0) + list.filter((j: any) => j.weather_flag).length,
    };
  }
  const fmtClock = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }).replace(" AM", "").replace(" PM", "") : "";
  const fmtWin = (t: string | null) => t ? `${Number(t.slice(0, 2)) % 12 || 12}${t.slice(3, 5) !== "00" ? ":" + t.slice(3, 5) : ""} ${Number(t.slice(0, 2)) >= 12 ? "PM" : "AM"}` : null;
  const nextDayLabel = nextRoute ? new Date(nextRoute.iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : null;
  const nextIsTomorrow = nextRoute ? nextRoute.iso === new Date(d.getTime() + 86400_000).toLocaleDateString("en-CA") : false;

  const day = wx?.days?.[0];
  // Both weather sources report a 0–1 fraction; the copy below reads percent.
  const rainRaw = day?.precipitationChance ?? null;
  const rain = rainRaw == null ? null : Math.round(rainRaw <= 1 ? rainRaw * 100 : rainRaw);

  return (
    <Shell role={role} realRole={realRole} previewing={previewing}
           name={profile.full_name ?? ""} email={profile.email ?? undefined}>

      <header className="mb-5">
        <p className="mo-eyebrow">{weekday} · {datePart}</p>
        <h1 className="mo-h1 mt-2 text-[30px] md:text-[36px]">
          {!list.length ? `Nothing today${firstName ? `, ${firstName}` : ""}` : allDone ? `Route done${firstName ? `, ${firstName}` : ""}.` : `${greet}${firstName ? `, ${firstName}` : ""}`}
        </h1>
        <div className="mo-hairline-soft mt-4" />

        {allDone && wrap && (
          <>
            <div className="mo-card aiv-glow mt-4 flex items-center gap-4 p-4">
              <div className="shrink-0">
                <div className="flex max-w-[84px] flex-wrap gap-1">
                  {list.slice(0, 12).map((j: any) => <span key={j.id} className="h-2.5 w-2.5 rounded-[3px] bg-sage" />)}
                </div>
                <div className="mo-eyebrow mt-1.5 text-sage">{done} of {list.length} done</div>
              </div>
              <div className="min-w-0">
                <div className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ink)]">{list.length} visit{list.length === 1 ? "" : "s"} · {wrap.verified} verified</div>
                <div className="text-[13px] text-[color:var(--body)]">
                  {wrap.minutes ? `${Math.floor(wrap.minutes / 60)} h ${wrap.minutes % 60} m on site` : "no clock times"}{wrap.clockedOut ? ` · clocked out ${wrap.clockedOut}` : ""}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="mo-card p-3"><div className="mo-eyebrow">Avg on site</div><div className="mo-num mt-1 text-[24px] font-semibold text-[color:var(--ink)]">{wrap.avg != null ? <>{wrap.avg}<span className="text-[14px] font-normal text-[color:var(--body)]"> m</span></> : "—"}</div></div>
              <div className="mo-card p-3"><div className="mo-eyebrow">Photos</div><div className="mo-num mt-1 text-[24px] font-semibold text-[color:var(--ink)]">{wrap.photos}</div></div>
              <div className="mo-card p-3"><div className="mo-eyebrow">Flags</div><div className={`mo-num mt-1 text-[24px] font-semibold ${wrap.flags ? "text-gold" : "text-[color:var(--ink)]"}`}>{wrap.flags}</div></div>
            </div>
          </>
        )}

        {!list.length && (
          <div className="mt-4">
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-[color:var(--border)] text-[color:var(--body)]">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M9.5 15l2 2 3.5-3.5" /></svg>
              </div>
              <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">No stops on the route</h2>
              <p className="mt-1.5 max-w-sm text-[15px] leading-snug text-[color:var(--body)]">
                {nextRoute ? `The next route is ${nextDayLabel?.split(",")[0]}, ${nextRoute.n} stop${nextRoute.n === 1 ? "" : "s"}${nextRoute.start ? ` starting ${fmtWin(nextRoute.start)}` : ""}${nextRoute.city ? ` in ${nextRoute.city}` : ""}.` : "Nothing is scheduled ahead yet."}
              </p>
            </div>
            <div className="mo-card p-0">
              {nextRoute && (
                <Link href={`/crm/schedule?m=${nextRoute.iso.slice(0, 7)}&d=${nextRoute.iso}`} className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3.5">
                  <div><div className="text-[16px] font-semibold text-[color:var(--ink)]">{nextDayLabel}</div><div className="text-[13px] text-[color:var(--body)]">{nextRoute.n} stop{nextRoute.n === 1 ? "" : "s"}{nextRoute.city ? ` · ${nextRoute.city}` : ""}</div></div>
                  <span className="text-[color:var(--faint)]">›</span>
                </Link>
              )}
              <Link href="/crm/messages" className="flex items-center justify-between px-4 py-3.5">
                <div><div className="text-[16px] font-semibold text-[color:var(--ink)]">Open Norma</div><div className="text-[13px] text-[color:var(--body)]">{waitingOnHuman ? `${waitingOnHuman} customer${waitingOnHuman === 1 ? "" : "s"} waiting on a human` : "Nobody is waiting on a human"}</div></div>
                <span className="text-[color:var(--faint)]">›</span>
              </Link>
            </div>
          </div>
        )}

        <div className={`mt-4 grid gap-2.5 sm:grid-cols-2 ${!list.length || allDone ? "hidden" : ""}`}>
          {/* the work — one dot per stop, filled as they finish; tap for the route map */}
          <Link href="/crm/routes" className="mo-card flex items-center gap-4 p-4 transition hover:border-white/20">
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
                {list.length ? `${done} of ${list.length} done · route ›` : "Enjoy it"}
              </div>
            </div>
          </Link>

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

      {allDone ? (
        <>
          <div className="mo-card p-0">
            <div className="mo-eyebrow px-4 py-2.5">Today&apos;s stops</div>
            {list.map((j: any) => {
              const mins = j.arrival_at && j.departure_at ? Math.max(1, Math.round((new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 60000)) : null;
              return (
                <Link key={j.id} href={`/crm/jobs/${j.id}`} className="flex items-center gap-3 border-t border-[color:var(--border)] px-4 py-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${j.status === "exception" ? "bg-gold" : "bg-sage"}`} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-[color:var(--ink)]">{j.customers?.full_name ?? "Customer"}</span>
                  {j.properties?.access_notes && <span className="mo-eyebrow shrink-0 rounded-full border border-gold/50 px-2 py-0.5 text-gold">Gate note</span>}
                  <span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">{fmtClock(j.arrival_at)}{mins ? ` · ${mins} m` : ""}</span>
                </Link>
              );
            })}
          </div>
          {nextRoute && (
            <Link href={`/crm/schedule?m=${nextRoute.iso.slice(0, 7)}&d=${nextRoute.iso}`} className="mt-4 grid min-h-[52px] place-items-center rounded-full border border-teal/50 text-[15px] font-semibold text-[color:var(--ink)]">
              {nextIsTomorrow ? "Tomorrow" : nextDayLabel?.split(",")[0]} · {nextRoute.n} stop{nextRoute.n === 1 ? "" : "s"}{nextRoute.start ? `, starts ${fmtWin(nextRoute.start)}` : ""}
            </Link>
          )}
        </>
      ) : list.length ? (
        <TodayStops jobs={list as any} photos={photosByJob} />
      ) : null}
    </Shell>
  );
}
