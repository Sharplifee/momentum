import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { ZonesCrewsSettings } from "@/components/crm/settings/ZonesCrewsSettings";

export const dynamic = "force-dynamic";

export default async function ZonesCrewsPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const [{ data: zones }, { data: crews }, { data: staff }] = await Promise.all([
    db.from("zones").select("id, name, cities, notes, active").order("id"),
    db.from("crews").select("id, name, lead_profile, home_zone, max_daily_jobs, max_weekly_clients, phone, notes, active").order("id"),
    db.from("profiles").select("id, full_name, role").in("role", ["owner", "manager", "crew"]).order("full_name"),
  ]);
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "Settings", href: "/crm/settings" }, { label: "Zones & crews", href: "/crm/settings/zones" }]} title="Zones & crews"
          sub={'Zones decide what the website calls "in our area" and which crew a new job lands with.'} />
        <ZonesCrewsSettings zones={(zones ?? []) as any} crews={(crews ?? []) as any} staff={(staff ?? []) as any} />
      </div>
    </Shell>
  );
}
