import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { RescheduleButton } from "@/components/portal/RescheduleButton";

export const dynamic = "force-dynamic";

export default async function Schedule() {
  const { customer, admin } = await requireCustomer();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, scheduled_date, window_start, window_end, status, services(name), crews(name)")
    .eq("customer_id", customer.id)
    .gte("scheduled_date", today)
    .neq("status", "cancelled")
    .order("scheduled_date")
    .limit(20);

  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Upcoming visits</h1>
      <div className="space-y-3">
        {(jobs ?? []).map((j: any) => (
          <div key={j.id} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{new Date(j.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>
                <p className="text-sm text-white/60">{j.services?.name} · {j.crews?.name ?? "crew TBD"} · {j.status}</p>
              </div>
              <RescheduleButton jobId={j.id} date={j.scheduled_date} />
            </div>
          </div>
        ))}
        {!jobs?.length && <p className="text-white/60">No upcoming visits. Message us to get on the schedule. 🌱</p>}
      </div>
    </PortalShell>
  );
}
