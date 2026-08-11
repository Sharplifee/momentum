import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader, StatCard } from "@/components/ui";
import { TrackerPanel } from "@/components/crm/TrackerPanel";
import { AddressSuggestions } from "@/components/crm/AddressSuggestions";

export const dynamic = "force-dynamic";

/**
 * GPS service verification. Everything here is computed server-side by the
 * Postgres engine (geofence match -> site_visits -> service_proofs -> exceptions);
 * this page only surfaces it.
 */
export default async function Tracker() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);

  const [ex, crew, devices, health, today] = await Promise.all([
    db.from("v_open_exceptions").select("*"),
    db.from("v_crew_live").select("*"),
    db.from("v_device_health").select("*"),
    db.from("v_service_health").select("*"),
    db.from("v_ops_today").select("gps_verified, status"),
  ]);

  // Unmatched addresses can never be verified on site, so they surface here
  // with the resolver's best reading of what they are meant to be.
  const { data: suggestions } = await db
    .from("address_suggestions")
    .select("id, property_id, original, original_city, suggested, suggested_city, confidence, reason")
    .eq("status", "open")
    .order("confidence", { ascending: false });

  const grouped = (suggestions ?? []).reduce((acc: Record<string, any[]>, s: any) => {
    (acc[s.property_id] ??= []).push(s);
    return acc;
  }, {});

  const exceptions = ex.data ?? [];
  const jobsToday = today.data ?? [];
  const critical = exceptions.filter((e: any) => e.severity === "critical").length;
  const high = exceptions.filter((e: any) => e.severity === "high").length;
  const verifiedToday = jobsToday.filter((j: any) => j.gps_verified).length;
  const needsAttention = (devices.data ?? []).filter((d: any) => d.health !== "healthy").length;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <PageHeader title="Tracker" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Open exceptions" value={exceptions.length} icon="🧭" />
        <StatCard label="Critical" value={critical} icon="🧭" />
        <StatCard label="High" value={high} icon="🧭" />
        <StatCard label="Verified today" value={`${verifiedToday}/${jobsToday.length}`} icon="☀️" tone={verifiedToday > 0 ? "win" : "default"} />
        <StatCard label="Devices to fix" value={needsAttention} icon="📱" />
      </div>

      <AddressSuggestions groups={grouped} />

      <TrackerPanel
        exceptions={exceptions as any}
        crew={(crew.data ?? []) as any}
        devices={(devices.data ?? []) as any}
        health={(health.data ?? []) as any}
      />
    </Shell>
  );
}
