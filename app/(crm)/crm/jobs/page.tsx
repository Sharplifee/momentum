import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { JobsBoard } from "@/components/crm/JobsBoard";

export const dynamic = "force-dynamic";

export default async function Jobs({ searchParams }: { searchParams: { week?: string; push_zones?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const start = searchParams.week ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const end = new Date(new Date(start).getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  const [{ data: jobs }, { data: crews }, { data: zones }] = await Promise.all([
    db.from("jobs").select("id, scheduled_date, status, price, crew_id, zone_id, weather_flag, window_start, arrival_at, departure_at, properties(address, city), services(name), customers(full_name)").gte("scheduled_date", start).lt("scheduled_date", end).order("scheduled_date"),
    db.from("crews").select("id, name").eq("active", true),
    db.from("zones").select("id, name"),
  ]);

  // margin per job: price − (linked expenses + labor est from crew time × hourly cost)
  const { data: billingCfg } = await db.from("system_config").select("value").eq("key", "billing").single();
  const hourly = Number((billingCfg?.value as any)?.labor_hourly_cost ?? 28);
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: jobExpenses } = jobIds.length
    ? await db.from("expenses").select("job_id, amount").in("job_id", jobIds)
    : { data: [] };
  const expByJob: Record<string, number> = {};
  for (const e of jobExpenses ?? []) expByJob[e.job_id!] = (expByJob[e.job_id!] ?? 0) + Number(e.amount);
  const withMargin = (jobs ?? []).map((j: any) => {
    const laborHours = j.arrival_at && j.departure_at ? (new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 3600_000 : 0.75;
    const margin = j.price != null ? Number(j.price) - (expByJob[j.id] ?? 0) - laborHours * hourly : null;
    return { ...j, margin };
  });

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Jobs & Dispatch</h1>
      <JobsBoard jobs={withMargin as any} crews={crews ?? []} zones={zones ?? []} weekStart={start} pushZones={searchParams.push_zones ?? null} />
    </Shell>
  );
}
