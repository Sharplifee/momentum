import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { PropertyForm } from "@/components/portal/PropertyForm";

export const dynamic = "force-dynamic";

export default async function Property() {
  const { customer, admin } = await requireCustomer();
  const { data: props } = await admin.from("properties").select("id, address, city, gate_code, pets, access_notes").eq("customer_id", customer.id);

  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Property</h1>
      {(props ?? []).map((p) => <PropertyForm key={p.id} property={p} />)}
      {!props?.length && <p className="text-white/60">No property on file yet — it'll appear after your first booking.</p>}
      <p className="mt-4 text-xs text-white/40">Changes reach the crew with the next morning's dispatch.</p>
    </PortalShell>
  );
}
