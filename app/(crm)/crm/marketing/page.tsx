import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";

export const dynamic = "force-dynamic";

export default async function Marketing({ searchParams }: { searchParams: { month?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const month = searchParams.month ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" }).slice(0, 7);

  const [{ data: leads }, { data: customers }, { data: spendCfg }, { data: adExpenses }] = await Promise.all([
    db.from("leads").select("id, source, fbclid, stage, quote_amount").neq("source", "test"),
    db.from("customers").select("id, source, lifetime_value").neq("status", "opted_out"),
    db.from("system_config").select("value").eq("key", "ad_spend_monthly").maybeSingle(),
    db.from("expenses").select("amount").eq("category", "marketing").gte("expense_date", `${month}-01`),
  ]);

  const bySource: Record<string, { leads: number; won: number; revenue: number }> = {};
  for (const l of leads ?? []) {
    const src = l.fbclid ? "meta_ads" : (l.source ?? "unknown");
    bySource[src] = bySource[src] ?? { leads: 0, won: 0, revenue: 0 };
    bySource[src].leads++;
    if (l.stage === "closed_won") bySource[src].won++;
  }
  for (const c of customers ?? []) {
    const src = c.source ?? "unknown";
    if (bySource[src]) bySource[src].revenue += Number(c.lifetime_value ?? 0);
  }
  const spend = Number((spendCfg?.value as any)?.[month] ?? 0) + (adExpenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const totalWon = Object.values(bySource).reduce((s, v) => s + v.won, 0);
  const cac = totalWon > 0 && spend > 0 ? spend / totalWon : null;

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 text-2xl font-bold">Marketing ROI — {month}</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="mo-card p-4"><div className="text-xs text-slate">Ad spend (marketing expenses{(spendCfg?.value as any)?.[month] ? " + manual entry" : ""})</div><div className="text-xl font-bold">${spend.toFixed(0)}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-slate">Customers won (all-time)</div><div className="text-xl font-bold">{totalWon}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-slate">CAC</div><div className="text-xl font-bold">{cac != null ? `$${cac.toFixed(0)}` : "—"}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-slate">Cost per booked job</div><div className="text-xl font-bold">{cac != null ? `$${cac.toFixed(0)}` : "— (needs spend)"}</div></div>
      </div>
      <h2 className="mb-2 font-semibold">By source</h2>
      <div className="overflow-x-auto mo-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[color:var(--border)] text-left text-slate dark:border-[color:var(--border)]"><th className="p-3">Source</th><th className="p-3">Leads</th><th className="p-3">Won</th><th className="p-3">Conv %</th><th className="p-3">Revenue (LTV)</th></tr></thead>
          <tbody>
            {Object.entries(bySource).map(([src, v]) => (
              <tr key={src} className="border-b border-[color:var(--border)]">
                <td className="p-3">{src}</td><td className="p-3">{v.leads}</td><td className="p-3">{v.won}</td>
                <td className="p-3">{v.leads ? Math.round((v.won / v.leads) * 100) : 0}%</td>
                <td className="p-3">${v.revenue.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-slate/70">Manual monthly ad spend: set system_config key <code>ad_spend_monthly</code> = {"{"}"{month}": 500{"}"} in Settings (Atlas integration later).</p>
    </Shell>
  );
}
