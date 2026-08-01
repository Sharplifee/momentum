import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Pnl({ searchParams }: { searchParams: { month?: string } }) {
  const { profile, role, db } = await requireStaff(["owner"]);
  const month = searchParams.month ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" }).slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonth = new Date(new Date(monthStart).getTime() + 32 * 86400_000).toISOString().slice(0, 7) + "-01";
  const yearStart = `${month.slice(0, 4)}-01-01`;

  const [{ data: monthPayments }, { data: monthExpenses }, { data: ytdPayments }, { data: ytdExpenses }] = await Promise.all([
    db.from("payments").select("amount, paid_at").gte("paid_at", monthStart).lt("paid_at", nextMonth),
    db.from("expenses").select("amount, category").gte("expense_date", monthStart).lt("expense_date", nextMonth),
    db.from("payments").select("amount").gte("paid_at", yearStart),
    db.from("expenses").select("amount").gte("expense_date", yearStart),
  ]);

  const revenue = (monthPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const byCategory: Record<string, number> = {};
  for (const e of monthExpenses ?? []) byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
  const expensesTotal = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const net = revenue - expensesTotal;
  const ytdRev = (ytdPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const ytdExp = (ytdExpenses ?? []).reduce((s, e) => s + Number(e.amount), 0);

  const prevMonth = new Date(new Date(monthStart).getTime() - 86400_000).toISOString().slice(0, 7);
  const nextMonthLink = nextMonth.slice(0, 7);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-1 text-2xl font-bold">P&L — {month}</h1>
      <p className="mb-4 text-sm">
        <Link className="underline" href={`/crm/money/pnl?month=${prevMonth}`}>← {prevMonth}</Link>
        {" · "}
        <Link className="underline" href={`/crm/money/pnl?month=${nextMonthLink}`}>{nextMonthLink} →</Link>
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="mo-card p-4"><div className="text-xs text-slate">Revenue</div><div className="text-xl font-bold">${revenue.toFixed(2)}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-slate">Expenses</div><div className="text-xl font-bold">${expensesTotal.toFixed(2)}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-slate">Net</div><div className={`text-xl font-bold ${net < 0 ? "text-red" : "text-[oklch(0.55_0.10_70)] dark:text-gold"}`}>${net.toFixed(2)}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-slate">Gross margin</div><div className="text-xl font-bold">{revenue > 0 ? `${Math.round((net / revenue) * 100)}%` : "—"}</div></div>
      </div>
      <h2 className="mb-2 font-semibold">Expenses by category</h2>
      <div className="mb-6 rounded-xl bg-white p-4 text-sm shadow-sm ">
        {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
          <div key={cat} className="flex justify-between border-b border-[color:var(--border)] py-1 last:border-0"><span className="capitalize">{cat}</span><span>${amt.toFixed(2)}</span></div>
        ))}
        {!Object.keys(byCategory).length && <p className="text-slate/70">No expenses recorded this month.</p>}
      </div>
      <div className="rounded-xl bg-white p-4 text-sm shadow-sm ">
        <strong>YTD:</strong> revenue ${ytdRev.toFixed(2)} · expenses ${ytdExp.toFixed(2)} · net ${(ytdRev - ytdExp).toFixed(2)}
      </div>
    </Shell>
  );
}
