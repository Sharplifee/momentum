import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { DeltaTile, BandCard, HBars, DonutChart } from "@/components/crm/Charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Accounting() {
  const { profile, role, db } = await requireStaff(["owner"]);
  const [{ data: customers }, { data: jobs }, { data: invoices }, { data: payments }, { data: expenses }, { data: proofs }] = await Promise.all([
    db.from("customers").select("id, full_name, phone, created_at").neq("status", "opted_out").order("full_name"),
    db.from("jobs").select("customer_id, status, scheduled_date"),
    db.from("invoices").select("id, customer_id, total, status, created_at").order("created_at", { ascending: false }),
    db.from("payments").select("customer_id, amount, created_at"),
    db.from("expenses").select("id, category, amount, vendor, expense_date").order("expense_date", { ascending: false }).limit(50),
    db.from("service_proofs").select("id, statement, minutes_on_site, arrival_at, departure_at, method, closest_meters, customers(full_name)").order("created_at", { ascending: false }).limit(12),
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
  const totExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const net = totPaid - totExpenses;
  const custName = (id: string | null) => (customers ?? []).find((c) => c.id === id)?.full_name ?? "—";
  const expByCat: Record<string, number> = {};
  for (const e of expenses ?? []) expByCat[e.category ?? "other"] = (expByCat[e.category ?? "other"] ?? 0) + Number(e.amount);
  const invStatus = (st: string) => st === "paid" ? "bg-green/15 text-green ring-green/30" : st === "overdue" ? "bg-red/15 text-red ring-red/30" : st === "void" ? "bg-white/10 text-[color:var(--body)] ring-white/10" : "bg-gold/15 text-gold ring-gold/30";

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Bookkeeping</div>
        <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Accounting</h1>
        <p className="mb-5 text-sm text-[color:var(--body)]">Everything in one place — ledger, invoices, expenses, and P&L, live.</p>

        {/* ===== Top band ===== */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DeltaTile label="Invoiced (all-time)" value={`$${totInvoiced.toFixed(0)}`} delta="billed" icon="▤" seed={4} />
          <DeltaTile label="Collected" value={`$${totPaid.toFixed(0)}`} delta="in the bank" icon="◈" seed={8} />
          <DeltaTile label="Outstanding" value={`$${totOutstanding.toFixed(0)}`} delta={totOutstanding > 0 ? "chase it" : "all clear"} up={totOutstanding <= 0} icon="◎" seed={12} />
          <DeltaTile label="Net P&L" value={`${net < 0 ? "-" : ""}$${Math.abs(net).toFixed(0)}`} delta={`$${totExpenses.toFixed(0)} expenses`} up={net >= 0} icon="✓" seed={6} />
        </div>

        {/* ===== Ledger ===== */}
        <BandCard title="Account ledger" sub="every account serviced" className="mb-6 !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--body)]/70">
                  <th className="px-5 py-3">Account</th><th className="px-4 py-3">Visits</th><th className="px-4 py-3">Upcoming</th>
                  <th className="px-4 py-3">Last service</th><th className="px-4 py-3 text-right">Invoiced</th>
                  <th className="px-4 py-3 text-right">Paid</th><th className="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {rows.map((r) => (
                  <tr key={r.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-5 py-3">
                      <Link href={`/crm/customers/${r.id}`} className="font-medium text-[color:var(--ink)] hover:text-teal">{r.full_name}</Link>
                      <div className="text-xs text-[color:var(--body)]">{r.phone?.startsWith("+1000") ? "phone pending" : r.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ink)]">{r.visits}</td>
                    <td className="px-4 py-3 text-[color:var(--ink)]">{r.upcoming}</td>
                    <td className="px-4 py-3 text-[color:var(--body)]">{r.lastSvc ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-[color:var(--ink)]">${r.invoiced.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-green">${r.paid.toFixed(2)}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${r.balance > 0 ? "text-gold" : "text-[color:var(--ink)]"}`}>${r.balance.toFixed(2)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[color:var(--body)]">No accounts yet — closed leads become accounts here.</td></tr>}
              </tbody>
            </table>
          </div>
        </BandCard>

        {/* ===== Invoices + Expenses + P&L, all inline ===== */}
        <div className="grid gap-6 lg:grid-cols-2">
          <BandCard title="Invoices" sub={`${(invoices ?? []).length} total`}>
            <div className="space-y-1.5">
              {(invoices ?? []).slice(0, 8).map((i) => (
                <div key={i.id} className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-white/[0.02] px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">{custName(i.customer_id)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${invStatus(i.status)}`}>{i.status}</span>
                  <span className="font-semibold text-[color:var(--ink)]">${Number(i.total).toFixed(2)}</span>
                </div>
              ))}
              {!(invoices ?? []).length && <p className="py-4 text-sm text-[color:var(--body)]">Invoices appear after completed visits.</p>}
            </div>
          </BandCard>

          <BandCard title="Expenses" sub={`$${totExpenses.toFixed(0)} tracked`}>
            {Object.keys(expByCat).length ? (
              <HBars rows={Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v], i) => ({ k: k[0].toUpperCase() + k.slice(1), v: Math.round(v), c: ["#e5b95e", "#8b7cf6", "#a5b0f0", "#4ade80", "#e0655a"][i] }))} />
            ) : <p className="py-2 text-sm text-[color:var(--body)]">No expenses logged yet.</p>}
            <div className="mt-4 space-y-1.5 border-t border-[color:var(--border)] pt-3">
              {(expenses ?? []).slice(0, 4).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-[color:var(--body)]">{e.vendor ?? e.category} · {e.expense_date}</span>
                  <span className="font-medium text-[color:var(--ink)]">${Number(e.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </BandCard>
        </div>

        <BandCard title="Proof of service" sub="auto-verified by GPS — no one has to check anything off" className="mt-6">
          <div className="space-y-2">
            {(proofs ?? []).map((p: any) => (
              <div key={p.id} className="flex items-start gap-3 rounded-xl border border-[color:var(--border)] bg-white/[0.02] px-3.5 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green/20 text-[10px] font-bold text-green">✓</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-[color:var(--ink)]">{p.statement}</span>
                  <span className="mt-0.5 block text-[11px] text-[color:var(--body)]">
                    {p.customers?.full_name ?? "Client"} · {p.minutes_on_site} min on site · within {Math.round(p.closest_meters ?? 0)}m · {p.method === "gps_auto" ? "verified automatically" : p.method}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-[color:var(--body)]/70">
                  {p.departure_at ? new Date(p.departure_at).toLocaleDateString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
            {!(proofs ?? []).length && (
              <p className="py-4 text-sm text-[color:var(--body)]">
                No verified visits yet. Once a crew phone is on site for the required time, the visit closes itself and the proof lands here.
              </p>
            )}
          </div>
        </BandCard>

        {/* ===== P&L strip ===== */}
        <BandCard title="Profit & Loss" sub="all-time, live" className="mt-6">
          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <DonutChart segs={[
              { k: "Collected", v: Math.round(totPaid), c: "#4ade80" },
              { k: "Expenses", v: Math.round(totExpenses), c: "#e5b95e" },
            ]} center={`${net < 0 ? "-" : ""}$${Math.abs(net).toFixed(0)}`} />
            <div className="grid grid-cols-3 gap-4 text-center sm:text-left">
              <div><div className="text-[11px] text-[color:var(--body)]">Revenue collected</div><div className="font-display text-2xl font-bold text-green">${totPaid.toFixed(0)}</div></div>
              <div><div className="text-[11px] text-[color:var(--body)]">Expenses</div><div className="font-display text-2xl font-bold text-gold">${totExpenses.toFixed(0)}</div></div>
              <div><div className="text-[11px] text-[color:var(--body)]">Net</div><div className={`font-display text-2xl font-bold ${net >= 0 ? "text-[color:var(--ink)]" : "text-red"}`}>{net < 0 ? "-" : ""}${Math.abs(net).toFixed(0)}</div></div>
            </div>
          </div>
        </BandCard>
      </div>
    </Shell>
  );
}
