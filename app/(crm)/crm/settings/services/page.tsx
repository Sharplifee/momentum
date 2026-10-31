import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { ServicesSettings } from "@/components/crm/settings/ServicesSettings";

export const dynamic = "force-dynamic";

export default async function ServicesSettingsPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const { data: services } = await db.from("services").select("id, name, slug, description, base_price, unit, duration_min, recurring, active").order("id");
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "Settings", href: "/crm/settings" }, { label: "Services", href: "/crm/settings/services" }]} title="Services"
          sub="What the website form, Norma, and the quote builder offer. Prices here are the starting point; quotes can override." />
        <ServicesSettings services={(services ?? []) as any} />
      </div>
    </Shell>
  );
}
