import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PropertyNotesForm, type PropertyNotes } from "@/components/crm/PropertyNotesForm";

export const dynamic = "force-dynamic";

export default async function PropertyNotesPage({ params, searchParams }: { params: { id: string }; searchParams: { p?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const { data: c } = await db.from("customers").select("id, full_name").eq("id", params.id).maybeSingle();
  if (!c) notFound();
  let q = db.from("properties").select("id, customer_id, address, city, gate_code, gate_width_in, access_notes, pets, has_dog, lot_notes, obstacles, watering_day, bags_clippings, haul_clippings").eq("customer_id", c.id).order("created_at").limit(1);
  if (searchParams.p) q = q.eq("id", searchParams.p);
  const { data: props } = await q;
  const p = props?.[0] as PropertyNotes | undefined;
  if (!p) notFound();

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <PropertyNotesForm property={p} customerName={c.full_name} />
    </Shell>
  );
}
