import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { JobsBoard } from "@/components/crm/JobsBoard";

export const dynamic = "force-dynamic";

export default async function Jobs({ searchParams }: { searchParams: { week?: string; push_zones?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const start = searchParams.week ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const end = new Date(new Date(start).getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  const [{ data: jobs }, { data: crews }, { data: zones }] = await Promise.all([
    db.from("jobs").select("id, scheduled_date, status, price, crew_id, zone_id, weather_flag, window_start, properties(address, city), services(name), customers(full_name)").gte("scheduled_date", start).lt("scheduled_date", end).order("scheduled_date"),
    db.from("crews").select("id, name").eq("active", true),
    db.from("zones").select("id, name"),
  ]);

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Jobs & Dispatch</h1>
      <JobsBoard jobs={(jobs ?? []) as any} crews={crews ?? []} zones={zones ?? []} weekStart={start} pushZones={searchParams.push_zones ?? null} />
    </Shell>
  );
}
