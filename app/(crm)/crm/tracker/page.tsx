import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { Tile } from "@/components/crm/Charts";
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
  // Urgency tiers (critical / high) are gone from the UI: an exception is
  // either open or it isn't, and the one that needs a person says so.
  const needsYou = exceptions.filter((e: any) => e.severity === "critical").length;
  const verifiedToday = jobsToday.filter((j: any) => j.gps_verified).length;
  const needsAttention = (devices.data ?? []).filter((d: any) => d.health !== "healthy").length;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <PageHeader eyebrow="Field" title="Tracker" />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Tile label="Open" value={exceptions.length} note={needsYou ? `${needsYou} need you` : "exceptions"} />
        <Tile label="Verified" value={<>{verifiedToday}<span className="text-[15px] font-normal text-[color:var(--body)]">/{jobsToday.length}</span></>} note="today" />
        <Tile label="Devices" value={needsAttention} note={needsAttention === 1 ? "needs a fix" : "need a fix"} />
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
