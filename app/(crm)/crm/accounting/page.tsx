import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Accounting() {
  const { profile, role, db } = await requireStaff(["owner"]);
  const [{ data: customers }, { data: jobs }, { data: invoices }, { data: payments }] = await Promise.all([
    db.from("customers").select("id, full_name, phone, created_at").neq("status", "opted_out").order("full_name"),
    db.from("jobs").select("customer_id, status, scheduled_date"),
    db.from("invoices").select("customer_id, total, status"),
    db.from("payments").select("customer_id, amount"),
  ]);

  const rows = (customers ?? []).map((c) => {
    const myJobs = (jobs ?? []).filter((j) => j.customer_id === c.id);
    const done = myJobs.filter((j) => j.status === "completed");
    const lastSvc = done.map((j) => j.scheduled_date).sort().at(-1) ?? null;
    const inv = (invoices ?? []).filter((i) => i.customer_id === c.id);
    const invoiced = inv.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.total), 0);
    const paid = (payments ?? []).filter((p) => p.customer_id === c.id).reduce((s, p) => s + Number(p.amount), 0);
    return { ...c, visits: done.length, upcoming: myJobs.filter((j) => j.status === "scheduled").length, lastSvc, invoiced, paid, balance: invoiced - paid };
  });

  const totInvoiced = rows.reduce((s, r) => s + r.invoiced, 0);
  const totPaid = rows.reduce((s, r) => s + r.paid, 0);
  const totOutstanding = totInvoiced - totPaid;

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Bookkeeping</div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Accounting</h1>
          <div className="flex gap-2 text-sm">
            <Link href="/crm/money" className="rounded-xl bg-white/[0.06] px-3 py-1.5 font-medium text-[color:var(--body)] transition hover:text-[color:var(--ink)]">Invoices</Link>
            <Link href="/crm/expenses" className="rounded-xl bg-white/[0.06] px-3 py-1.5 font-medium text-[color:var(--body)] transition hover:text-[color:var(--ink)]">Expenses</Link>
            <Link href="/crm/money/pnl" className="mo-primary rounded-xl px-3 py-1.5 font-semibold">P&L →</Link>
          </div>
        </div>
        <p className="mb-5 text-sm text-[color:var(--body)]">Every account serviced — visits, billing, and balance in one ledger.</p>

        <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          {[
            { l: "Invoiced (all-time)", v: `$${totInvoiced.toFixed(0)}` },
            { l: "Collected", v: `$${totPaid.toFixed(0)}`, cls: "text-green" },
            { l: "Outstanding", v: `$${totOutstanding.toFixed(0)}`, cls: totOutstanding > 0 ? "text-gold" : "" },
          ].map((t) => (
            <div key={t.l} className="mo-card aiv-glow p-4">
              <div className="text-[11px] text-[color:var(--body)]">{t.l}</div>
              <div className={`mt-0.5 font-display text-2xl font-bold text-[color:var(--ink)] ${t.cls ?? ""}`}>{t.v}</div>
            </div>
          ))}
        </div>

        <div className="mo-card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--body)]/70">
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Visits done</th>
                <th className="px-4 py-3">Upcoming</th>
                <th className="px-4 py-3">Last service</th>
                <th className="px-4 py-3 text-right">Invoiced</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.map((r) => (
                <tr key={r.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/crm/customers/${r.id}`} className="font-medium text-[color:var(--ink)] hover:text-teal">{r.full_name}</Link>
                    <div className="text-xs text-[color:var(--body)]">{r.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--ink)]">{r.visits}</td>
                  <td className="px-4 py-3 text-[color:var(--ink)]">{r.upcoming}</td>
                  <td className="px-4 py-3 text-[color:var(--body)]">{r.lastSvc ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-[color:var(--ink)]">${r.invoiced.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-green">${r.paid.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.balance > 0 ? "text-gold" : "text-[color:var(--ink)]"}`}>${r.balance.toFixed(2)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[color:var(--body)]">No accounts yet — closed leads become accounts here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
