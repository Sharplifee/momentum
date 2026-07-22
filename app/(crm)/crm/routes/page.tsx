import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";

export const dynamic = "force-dynamic";

/** Naive nearest-neighbor ordering over cached lat/lng (Nominatim geocode fills cache lazily). */
function orderStops(stops: any[]): any[] {
  const withCoords = stops.filter((s) => s.properties?.lat && s.properties?.lng);
  const without = stops.filter((s) => !s.properties?.lat || !s.properties?.lng);
  if (withCoords.length < 2) return stops;
  const ordered = [withCoords.shift()!];
  while (withCoords.length) {
    const last = ordered[ordered.length - 1].properties;
    let bestIdx = 0, bestDist = Infinity;
    withCoords.forEach((s, i) => {
      const d = (s.properties.lat - last.lat) ** 2 + (s.properties.lng - last.lng) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    ordered.push(withCoords.splice(bestIdx, 1)[0]);
  }
  return [...ordered, ...without];
}

export default async function Routes({ searchParams }: { searchParams: { date?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager", "crew"]);
  const date = searchParams.date ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const { data: crews } = await db.from("crews").select("id, name").eq("active", true);
  const { data: jobs } = await db
    .from("jobs")
    .select("id, crew_id, window_start, properties(address, city, lat, lng), services(name), customers(full_name)")
    .eq("scheduled_date", date)
    .neq("status", "cancelled");

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Routes — {date}</h1>
      <form className="mb-4"><input type="date" name="date" defaultValue={date} className="rounded-lg border border-stone-300 p-2 text-sm dark:border-stone-700 dark:bg-stone-800" /> <button className="rounded-lg bg-moss px-3 py-2 text-sm text-white">Go</button></form>
      <div className="grid gap-4 md:grid-cols-2">
        {(crews ?? []).map((crew) => {
          const stops = orderStops((jobs ?? []).filter((j) => j.crew_id === crew.id));
          return (
            <div key={crew.id} className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
              <h2 className="mb-2 font-semibold">{crew.name} ({stops.length} stops)</h2>
              <ol className="space-y-1 text-sm">
                {stops.map((s: any, i: number) => (
                  <li key={s.id}>{i + 1}. {s.properties?.address}, {s.properties?.city} — {s.services?.name} ({s.customers?.full_name ?? "?"}){!s.properties?.lat && <span className="text-xs text-stone-400"> · ungeocoded</span>}</li>
                ))}
                {!stops.length && <li className="text-stone-400">No stops.</li>}
              </ol>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-stone-400">Ordering: nearest-neighbor over cached coordinates. Addresses geocode automatically overnight (Nominatim).</p>
    </Shell>
  );
}
