import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { ExpenseForm } from "@/components/crm/ExpenseForm";

export const dynamic = "force-dynamic";

export default async function Expenses() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const { data: expenses } = await db
    .from("expenses")
    .select("id, category, amount, vendor, expense_date, receipt_url, job_id")
    .order("expense_date", { ascending: false })
    .limit(100);
  const { data: recentJobs } = await db
    .from("jobs").select("id, scheduled_date, customers(full_name)").order("scheduled_date", { ascending: false }).limit(30);

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 text-2xl font-bold">Expenses</h1>
      <ExpenseForm jobs={(recentJobs ?? []).map((j: any) => ({ id: j.id, label: `${j.scheduled_date} — ${j.customers?.full_name ?? "?"}` }))} />
      <div className="mt-6 overflow-x-auto mo-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[color:var(--border)] text-left text-slate dark:border-[color:var(--border)]"><th className="p-3">Date</th><th className="p-3">Category</th><th className="p-3">Vendor</th><th className="p-3">Amount</th><th className="p-3">Job</th><th className="p-3">Receipt</th></tr></thead>
          <tbody>
            {(expenses ?? []).map((e) => (
              <tr key={e.id} className="border-b border-[color:var(--border)]">
                <td className="p-3">{e.expense_date}</td>
                <td className="p-3 capitalize">{e.category}</td>
                <td className="p-3">{e.vendor ?? "—"}</td>
                <td className="p-3">${Number(e.amount).toFixed(2)}</td>
                <td className="p-3 font-mono text-xs">{e.job_id ? e.job_id.slice(0, 8) : "—"}</td>
                <td className="p-3">{e.receipt_url ? <a className="underline" href={`/api/crm/expenses?receipt=${e.id}`} target="_blank">view</a> : "—"}</td>
              </tr>
            ))}
            {!expenses?.length && <tr><td colSpan={6} className="p-6 text-slate/70">No expenses yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
