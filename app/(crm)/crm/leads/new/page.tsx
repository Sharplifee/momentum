import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { NewLeadForm } from "@/components/crm/NewLeadForm";

export const dynamic = "force-dynamic";

/** Phone-in lead — the same intake as the website form, typed by staff. */
export default async function NewLeadPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const { data: services } = await db.from("services").select("id, name, slug").eq("active", true).order("id");
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <NewLeadForm services={(services ?? []) as any} />
    </Shell>
  );
}
