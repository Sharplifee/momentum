import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";

export const dynamic = "force-dynamic";
const COLS = ["scheduled", "in_progress", "completed", "exception"] as const;

export default async function Tracker() {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const { data: jobs } = await db
    .from("jobs")
    .select("id, status, arrival_at, departure_at, weather_flag, crews(name), properties(address, city), services(name), customers(full_name)")
    .eq("scheduled_date", today)
    .neq("status", "cancelled");

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Crew Tracker — {today}</h1>
      <div className="grid gap-3 md:grid-cols-4">
        {COLS.map((col) => (
          <div key={col} className="rounded-xl bg-white p-3 shadow-sm dark:bg-stone-900">
            <h2 className="mb-2 text-sm font-semibold capitalize text-stone-500">{col.replace("_", " ")} ({(jobs ?? []).filter((j) => j.status === col).length})</h2>
            {(jobs ?? []).filter((j) => j.status === col).map((j: any) => (
              <div key={j.id} className={`mb-2 rounded-lg border p-2 text-xs ${col === "exception" ? "border-red-300 bg-red-50 dark:bg-red-950" : "border-stone-200 dark:border-stone-700"}`}>
                <div className="font-medium">{j.customers?.full_name ?? j.properties?.address}</div>
                <div className="text-stone-500">{j.properties?.address}, {j.properties?.city} · {j.services?.name} · {j.crews?.name ?? "unassigned"}</div>
                {j.arrival_at && <div className="text-stone-400">in {new Date(j.arrival_at).toLocaleTimeString("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" })}</div>}
                {j.departure_at && <div className="text-stone-400">out {new Date(j.departure_at).toLocaleTimeString("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" })}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}
