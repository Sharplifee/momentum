import { smsPausedReason } from "@/lib/smsStatus";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { NewInvoiceForm } from "@/components/crm/NewInvoiceForm";
import { getBillingConfig } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ searchParams }: { searchParams: { customer?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const smsPaused = await smsPausedReason(db);
  const cfg = await getBillingConfig();
  const { data: c } = searchParams.customer
    ? await db.from("customers").select("id, full_name, phone").eq("id", searchParams.customer).maybeSingle()
    : { data: null };
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <NewInvoiceForm smsPaused={smsPaused} taxRate={cfg.tax_rate} taxLabel={cfg.tax_label} netDays={cfg.net_days}
        initialCustomer={c ? { type: "customer", id: c.id, label: c.full_name, sub: c.phone } : null} />
    </Shell>
  );
}
