import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { SmsTemplatesSettings } from "@/components/crm/settings/SmsTemplatesSettings";

export const dynamic = "force-dynamic";

export default async function SmsTemplatesPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const { data: templates } = await db.from("sms_templates").select("id, name, body, sequence_order, delay_minutes, active")
    .order("sequence_order", { nullsFirst: false }).order("id");
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "Settings", href: "/crm/settings" }, { label: "SMS templates", href: "/crm/settings/sms-templates" }]} title="SMS templates"
          sub="Everything Norma sends on her own. Edit the words, keep the fields in braces." />
        <SmsTemplatesSettings templates={(templates ?? []) as any} />
      </div>
    </Shell>
  );
}
