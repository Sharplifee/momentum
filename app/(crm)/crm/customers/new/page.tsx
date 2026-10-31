import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { NewCustomerForm } from "@/components/crm/NewCustomerForm";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const [{ data: zones }, { data: services }] = await Promise.all([
    db.from("zones").select("id, cities").eq("active", true).order("id"),
    db.from("services").select("slug, base_price").in("slug", ["weekly-mow", "biweekly-mow"]),
  ]);
  const defaultPrices: Record<string, number | null> = {
    weekly: (services ?? []).find((s) => s.slug === "weekly-mow")?.base_price ?? null,
    biweekly: (services ?? []).find((s) => s.slug === "biweekly-mow")?.base_price ?? null,
  };
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <NewCustomerForm zones={(zones ?? []).map((z) => ({ id: z.id, cities: (z.cities as string[]) ?? [] }))} defaultPrices={defaultPrices} />
    </Shell>
  );
}
