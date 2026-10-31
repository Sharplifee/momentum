import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { RainHold, type HoldStop } from "@/components/crm/RainHold";

export const dynamic = "force-dynamic";

/**
 * Rain hold for one day. Reached from the weather cron's owner text and from
 * any flagged day on the schedule. Forecast comes from /api/weather for the
 * first affected property; the stop list is that day's scheduled jobs.
 */
export default async function HoldPage({ searchParams }: { searchParams: Promise<{ date?: string; zones?: string }> }) {
  const [{ profile, role, realRole, previewing, db }, sp] = await Promise.all([requireStaff(["owner", "manager"]), searchParams]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today;
  const zones = (sp.zones ?? "").split(",").map(Number).filter((n) => n > 0);

  let q = db.from("jobs")
    .select("id, crew_id, weather_flag, zone_id, window_start, services(name, recurring), customers(full_name), crews(name, max_daily_jobs), properties(lat, lng)")
    .eq("scheduled_date", date).eq("status", "scheduled").order("window_start", { ascending: true, nullsFirst: false });
  if (zones.length) q = q.in("zone_id", zones);
  const { data: jobs } = await q;
  const list = (jobs ?? []) as any[];

  // Forecast for the first stop that has a pin.
  let rainPct: number | null = null; let highF: number | null = null; let pulledAt: string | null = null;
  const pin = list.find((j) => j.properties?.lat && j.properties?.lng)?.properties;
  if (pin) {
    try {
      const r = await fetch(`https://crm.momentumlandscapingut.com/api/weather?lat=${pin.lat}&lng=${pin.lng}`, { next: { revalidate: 900 } });
      if (r.ok) {
        const wx = await r.json();
        const d = (wx.days ?? []).find((x: any) => x.date === date) ?? wx.days?.[0];
        if (d?.precipitationChance != null) rainPct = Math.round(d.precipitationChance <= 1 ? d.precipitationChance * 100 : d.precipitationChance);
        if (d?.highF != null) highF = Math.round(d.highF);
        pulledAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
      }
    } catch { /* the hold still works without a forecast */ }
  }

  // Proposed landing day per stop: next non-Sunday with room on its crew.
  const crewRoom = new Map<string, number>();
  const stops: HoldStop[] = [];
  for (const j of list) {
    let proposed: string | null = null;
    for (let i = 1; i <= 10 && !proposed; i++) {
      const d = new Date(new Date(date + "T12:00:00").getTime() + i * 86400_000);
      if (d.getDay() === 0) continue;
      const iso = d.toLocaleDateString("en-CA");
      const key = `${j.crew_id}:${iso}`;
      if (!crewRoom.has(key)) {
        const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("crew_id", j.crew_id ?? -1).eq("scheduled_date", iso).neq("status", "cancelled");
        crewRoom.set(key, (j.crews?.max_daily_jobs ?? 12) - (count ?? 0));
      }
      if ((crewRoom.get(key) ?? 0) > 0) { proposed = iso; if (j.services?.recurring) crewRoom.set(key, (crewRoom.get(key) ?? 0) - 1); }
    }
    stops.push({ id: j.id, name: j.customers?.full_name ?? "Customer", service: j.services?.name ?? "Visit", recurring: Boolean(j.services?.recurring), flagged: Boolean(j.weather_flag), crew: j.crews?.name ?? null, proposed });
  }
  const crewName = stops.find((s) => s.crew)?.crew ?? null;
  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const weekday = dateLabel.split(",")[0];

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <nav className="mo-eyebrow mb-4 flex items-center gap-1.5">
          <Link href="/crm/schedule" className="transition hover:text-[color:var(--ink)]">‹ Schedule</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
        </nav>

        <section className="mo-card aiv-glow mb-3 flex items-center gap-4 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-gold/50 text-gold">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7 15a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 8.5a3.5 3.5 0 0 1-.5 6.96H7z"/><path d="M8 18v2M12 18v3M16 18v2"/></svg>
          </div>
          <div className="min-w-0">
            <div className="mo-eyebrow text-gold">{list.some((j) => j.weather_flag) ? "Rain hold suggested" : "Rain hold"}</div>
            <div className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ink)]">
              {weekday}{rainPct != null ? ` · ${rainPct}% rain` : ""}{highF != null ? ` · ${highF}°` : ""}
            </div>
            <div className="text-[13px] text-[color:var(--body)]">{pulledAt ? `Forecast pulled ${pulledAt} · ` : "No forecast for this day · "}wet-grass rule applies to mowing only</div>
          </div>
        </section>

        <RainHold date={date} dateLabel={dateLabel} stops={stops} crewName={crewName} />
      </div>
    </Shell>
  );
}
