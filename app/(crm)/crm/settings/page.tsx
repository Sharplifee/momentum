import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { SettingsPanel } from "@/components/crm/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { profile, role, db } = await requireStaff(["owner"]);
  const [{ data: services }, { data: zones }, { data: config }, { data: templates }, { data: crews }] = await Promise.all([
    db.from("services").select("*").order("id"),
    db.from("zones").select("*").order("id"),
    db.from("system_config").select("key, value").order("key"),
    db.from("sms_templates").select("*").order("id"),
    db.from("crews").select("*").order("id"),
  ]);
  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <SettingsPanel services={services ?? []} zones={zones ?? []} config={config ?? []} templates={templates ?? []} crews={crews ?? []} />
    </Shell>
  );
}
