import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { TodayStops } from "@/components/crm/TodayStops";

export const dynamic = "force-dynamic";

export default async function Today() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager", "crew"]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  // crew: own crew's jobs (RLS also enforces); staff: all
  let crewIds: number[] = [];
  if (role === "crew") {
    const { data: cm } = await db.from("crew_members").select("crew_id").eq("profile_id", profile.id);
    crewIds = (cm ?? []).map((c) => c.crew_id);
  }
  let q = db.from("jobs").select("id, status, arrival_at, departure_at, window_start, notes, weather_flag, properties(address, city, gate_code, pets, access_notes, gate_width_in, has_dog, obstacles), services(name), customers(full_name)").eq("scheduled_date", today).neq("status", "cancelled").order("window_start", { ascending: true, nullsFirst: false });
  if (role === "crew" && crewIds.length) q = q.in("crew_id", crewIds);
  const { data: jobs } = await q;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Today — {today}</h1>
      <TodayStops jobs={(jobs ?? []) as any} />
    </Shell>
  );
}
