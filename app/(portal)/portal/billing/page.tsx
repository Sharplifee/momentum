import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";

export const dynamic = "force-dynamic";

export default async function Billing() {
  const { customer, admin } = await requireCustomer();
  const { data: invoices } = await admin
    .from("invoices")
    .select("id, number, total, status, due_date, created_at, line_items, payments(amount, paid_at, method)")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  const jobIds = [...new Set((invoices ?? []).flatMap((inv: any) => (inv.line_items ?? []).map((l: any) => l.job_id).filter(Boolean)))];
  const { data: proofs } = jobIds.length
    ? await admin.from("service_proofs").select("job_id, statement").in("job_id", jobIds)
    : { data: [] };
  const proofByJob: Record<string, string> = {};
  for (const p of proofs ?? []) if (p.job_id) proofByJob[p.job_id] = p.statement;

  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Billing</h1>
      <div className="space-y-3">
        {(invoices ?? []).map((inv: any) => (
          <div key={inv.id} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="flex justify-between">
              <span className="font-semibold">Invoice #{inv.number ?? "—"}</span>
              <span className={inv.status === "paid" ? "text-teal" : "text-amber-300"}>{inv.status}</span>
            </div>
            <p className="text-2xl font-bold">${Number(inv.total ?? 0).toFixed(2)}</p>
            {inv.due_date && <p className="text-xs text-white/50">Due {inv.due_date}</p>}
            {(inv.line_items ?? []).map((l: any, i: number) => proofByJob[l.job_id] && (
              <p key={i} className="mt-1 flex items-start gap-1.5 text-xs text-white/60">
                <span className="text-teal">✓</span> {proofByJob[l.job_id]}
              </p>
            ))}
            {(inv.payments ?? []).map((p: any, i: number) => (
              <p key={i} className="text-xs text-white/50">Paid ${Number(p.amount).toFixed(2)} · {p.method} · {new Date(p.paid_at).toLocaleDateString()}</p>
            ))}
          </div>
        ))}
        {!invoices?.length && <p className="text-white/60">No invoices yet — billing starts after your first completed visit.</p>}
      </div>
      <p className="mt-4 text-xs text-white/40">Online payment arrives soon; we'll text you a secure link when it's live.</p>
    </PortalShell>
  );
}
