import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { TeamAlertsSettings } from "@/components/crm/settings/TeamAlertsSettings";

export const dynamic = "force-dynamic";

/**
 * Team alerts are one phone list in system_config.team_alerts. Every alert the
 * code sends (new lead, Norma booked, Norma escalated) goes to the whole list
 * by SMS, so the screen is people-on-or-off, not a per-event matrix.
 */
export default async function TeamAlertsPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const [{ data: cfg }, { data: staff }, { data: quiet }] = await Promise.all([
    db.from("system_config").select("value").eq("key", "team_alerts").single(),
    db.from("profiles").select("id, full_name, role, phone").in("role", ["owner", "manager", "crew"]).order("full_name"),
    db.from("system_config").select("value").eq("key", "quiet_hours").single(),
  ]);
  const v = (cfg?.value ?? {}) as { mode?: string; recipients?: string[]; launch_recipients?: string[] };
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "Settings", href: "/crm/settings" }, { label: "Team alerts", href: "/crm/settings/team-alerts" }]} title="Team alerts"
          sub="Who gets texted when something needs a person. One list, every alert." />
        <TeamAlertsSettings
          mode={v.mode ?? "testing"}
          recipients={v.recipients ?? []}
          launchRecipients={v.launch_recipients ?? []}
          staff={(staff ?? []) as any}
          quiet={(quiet?.value as any) ?? null}
        />
      </div>
    </Shell>
  );
}
