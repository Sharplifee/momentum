import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { ExpenseButton } from "@/components/crm/ExpenseForm";
import { EXPENSE_CATEGORIES } from "@/lib/expenseCategories";
import { EmptyState } from "@/components/ui";
import { periodFor, money } from "@/lib/periods";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { fuel: "#7ac1c9", dump: "#efe7d6", equipment: "#e3a35f", supplies: "#d9775c", materials: "#d9775c", other: "#9b9790" };
const label = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c[0].toUpperCase() + c.slice(1);
const mdy = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Where the money went this month, by category and one line at a time.
 * The receipt chip is the honest one: green when a photo is attached.
 */
export default async function Expenses({ searchParams }: { searchParams: { cat?: string; new?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const period = periodFor("month");
  const cat = searchParams.cat ?? "";

  let q = db.from("expenses").select("id, category, amount, vendor, expense_date, receipt_url, job_id").order("expense_date", { ascending: false }).order("id", { ascending: false }).limit(150);
  if (cat) q = q.eq("category", cat);
  const [{ data: list }, { data: month }, { data: recentJobs }] = await Promise.all([
    q,
    db.from("expenses").select("category, amount").gte("expense_date", period.start).lt("expense_date", period.end),
    db.from("jobs").select("id, scheduled_date, customers(full_name), services(name)").neq("status", "cancelled").order("scheduled_date", { ascending: false }).limit(40),
  ]);
  const jobIds = [...new Set((list ?? []).map((e) => e.job_id).filter(Boolean))] as string[];
  const { data: linked } = jobIds.length ? await db.from("jobs").select("id, customers(full_name), services(name)").in("id", jobIds) : { data: [] as any[] };
  const jobLabel = new Map((linked ?? []).map((j: any) => [j.id, `${j.customers?.full_name ?? "job"} · ${(j.services?.name ?? "visit").toLowerCase()}`]));

  const byCat: Record<string, number> = {};
  for (const e of month ?? []) byCat[e.category ?? "other"] = (byCat[e.category ?? "other"] ?? 0) + Number(e.amount);
  const monthTotal = Object.values(byCat).reduce((s, v) => s + v, 0);
  const bars = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const barMax = Math.max(1, ...bars.map(([, v]) => v));
  const chips = [{ value: "", label: "All" }, ...EXPENSE_CATEGORIES.filter((c) => c.value !== "other"), ...Object.keys(byCat).filter((c) => !EXPENSE_CATEGORIES.some((x) => x.value === c)).map((c) => ({ value: c, label: label(c) })), { value: "other", label: "Other" }];

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <nav className="mo-eyebrow flex items-center gap-1.5">
            <Link href="/crm/accounting" className="transition hover:text-[color:var(--ink)]">‹ Accounting</Link>
            <span className="text-[color:var(--faint)]">/</span>
            <span>Expenses</span>
          </nav>
          <ExpenseButton openInitially={searchParams.new === "1"} jobs={(recentJobs ?? []).map((j: any) => ({ id: j.id, label: `${mdy(j.scheduled_date)} · ${j.customers?.full_name ?? "?"} · ${(j.services?.name ?? "visit").toLowerCase()}` }))} />
        </div>

        <div className="mb-4 flex items-end justify-between gap-3">
          <div><div className="mo-eyebrow">{period.label}</div><h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">Expenses</h1></div>
          <div className="text-right"><div className="mo-num text-[24px] leading-none text-[color:var(--ink)]">{money(monthTotal)}</div><div className="mo-eyebrow mt-1">this month</div></div>
        </div>

        <div className="mo-card mb-3 flex flex-col gap-2 px-3.5 py-3">
          {bars.map(([c, v]) => (
            <div key={c} className="flex items-center gap-2.5">
              <span className="w-[76px] truncate text-[13px] text-[color:var(--body)]">{label(c)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full" style={{ width: `${(v / barMax) * 100}%`, background: "#7ac1c9" }} /></span>
              <span className="mo-mono w-[60px] text-right text-[12px] text-[color:var(--ink)]">{money(v)}</span>
            </div>
          ))}
          {!bars.length && <p className="py-1 text-[13px] text-[color:var(--body)]">Nothing logged in {period.short} yet.</p>}
        </div>

        <div className="mb-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => (
            <Link key={c.value || "all"} href={c.value ? `/crm/expenses?cat=${c.value}` : "/crm/expenses"} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${cat === c.value ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>{c.label}</Link>
          ))}
        </div>

        {!list?.length ? (
          <EmptyState title={cat ? `No ${label(cat).toLowerCase()} expenses` : "No expenses yet"} hint={cat ? "Nothing in this category." : "Fuel, dump runs, parts — log them as they happen and the P&L stays honest."} />
        ) : (
          <div className="mo-card p-0">
            {list.map((e, idx) => {
              const row = (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[e.category] ?? DOT.other }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[color:var(--ink)]">{e.vendor || label(e.category)}{e.vendor ? ` · ${label(e.category).toLowerCase()}` : ""}</span>
                    <span className="block truncate text-[12px] text-[color:var(--body)]">{mdy(e.expense_date)}{e.job_id && jobLabel.get(e.job_id) ? ` · ${jobLabel.get(e.job_id)}` : ""}</span>
                  </span>
                  <span className="mo-mono text-[13px] text-[color:var(--ink)]">{money(Number(e.amount), true)}</span>
                  <span className={`mo-eyebrow rounded-full border px-2 py-0.5 text-[9px] ${e.receipt_url ? "border-sage/50 text-sage" : "border-gold/60 text-gold"}`}>{e.receipt_url ? "Receipt" : "No receipt"}</span>
                </>
              );
              const cls = `flex items-center gap-3 px-4 py-3 ${idx ? "border-t border-[color:var(--border)]" : ""}`;
              return e.receipt_url
                ? <a key={e.id} href={`/api/crm/expenses?receipt=${e.id}`} target="_blank" rel="noreferrer" className={`${cls} transition hover:bg-white/[0.03]`}>{row}</a>
                : <div key={e.id} className={cls}>{row}</div>;
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
