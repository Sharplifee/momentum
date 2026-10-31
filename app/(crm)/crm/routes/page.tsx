import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { RouteMap, type RouteStop } from "@/components/crm/RouteMap";

export const dynamic = "force-dynamic";

/** Today's route — the map with numbered stops, then the stops in order. */
export default async function RoutePage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager", "crew"]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  let q = db.from("jobs")
    .select("id, status, arrival_at, departure_at, window_start, weather_flag, properties(address, city, lat, lng), customers(full_name)")
    .eq("scheduled_date", today).neq("status", "cancelled")
    .order("window_start", { ascending: true, nullsFirst: false });
  if (role === "crew") {
    const { data: cm } = await db.from("crew_members").select("crew_id").eq("profile_id", profile.id);
    const ids = (cm ?? []).map((c) => c.crew_id);
    if (ids.length) q = q.in("crew_id", ids);
  }
  const { data: jobs } = await q;
  const list = (jobs ?? []) as any[];
  const activeIdx = Math.max(0, list.findIndex((j) => !j.departure_at && j.arrival_at), list.findIndex((j) => !j.departure_at));
  const stops: RouteStop[] = list.map((j, i) => ({
    id: j.id, n: i + 1, name: j.customers?.full_name ?? "Customer",
    address: j.properties?.address ?? "", city: j.properties?.city ?? null,
    lat: j.properties?.lat ?? null, lng: j.properties?.lng ?? null,
    done: Boolean(j.departure_at), active: i === activeIdx && !j.departure_at, weather_flag: Boolean(j.weather_flag),
    window_start: j.window_start,
  }));
  const next = stops.find((s) => s.active);
  const later = stops.filter((s) => !s.done && !s.active);
  const maps = (s: RouteStop) => s.lat && s.lng ? `https://maps.apple.com/?daddr=${s.lat},${s.lng}` : `https://maps.apple.com/?daddr=${encodeURIComponent(`${s.address}, ${s.city ?? ""} UT`)}`;
  const fmt = (t: string | null) => t ? `${Number(t.slice(0, 2)) % 12 || 12}${t.slice(3, 5) !== "00" ? ":" + t.slice(3, 5) : ""} ${Number(t.slice(0, 2)) >= 12 ? "PM" : "AM"}` : "";

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <nav className="mo-eyebrow mb-4 flex items-center gap-1.5">
        <Link href="/crm/today" className="transition hover:text-[color:var(--ink)]">‹ Today</Link>
        <span className="text-[color:var(--faint)]">/</span>
        <span>Route</span>
      </nav>

      <RouteMap token={process.env.MAPKIT_TOKEN ?? null} stops={stops} />

      <div className="mo-card mt-4 p-0">
        {next ? (
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <Link href={`/crm/jobs/${next.id}`} className="flex items-center gap-3">
              <span className="mo-mono grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--ink)] text-[13px] font-bold text-[#0a0a0a]">{next.n}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold text-[color:var(--ink)]">{next.name} · next</div>
                <div className="truncate text-[13px] text-[color:var(--body)]">{fmt(next.window_start) ? `${fmt(next.window_start)} · ` : ""}{next.address}</div>
              </div>
            </Link>
            <a href={maps(next)} target="_blank" rel="noreferrer" className="mo-eyebrow mt-2 inline-block rounded-full border border-teal/50 px-3 py-1.5 text-teal">Open in Apple Maps</a>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-[color:var(--body)]">{stops.length ? "Every stop is done." : "No route today."}</div>
        )}
        {later.map((s) => (
          <Link key={s.id} href={`/crm/jobs/${s.id}`} className="flex items-center gap-3 border-b border-[color:var(--border)] px-4 py-3 last:border-b-0">
            <span className="mo-mono grid h-8 w-8 shrink-0 place-items-center rounded-full border border-teal/50 text-[12px] text-[color:var(--ink)]">{s.n}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-[color:var(--ink)]">{s.name}</div>
              <div className="truncate text-[13px] text-[color:var(--body)]">{fmt(s.window_start) ? `${fmt(s.window_start)} · ` : ""}{s.city ?? s.address}</div>
            </div>
            {s.weather_flag && <span className="mo-eyebrow shrink-0 text-gold">Rain flag</span>}
          </Link>
        ))}
        {stops.filter((s) => s.done).map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-[color:var(--border)] px-4 py-2.5 opacity-60 last:border-b-0">
            <span className="mo-mono grid h-8 w-8 shrink-0 place-items-center rounded-full border border-sage/50 text-[12px] text-sage">✓</span>
            <div className="min-w-0 flex-1 truncate text-[14px] text-[color:var(--ink)]">{s.name}</div>
            <span className="mo-eyebrow">Done</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
