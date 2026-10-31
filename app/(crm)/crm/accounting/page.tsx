import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { BandCard } from "@/components/crm/Charts";
import { LinkButton } from "@/components/ui";
import { parseRange, periodFor, money } from "@/lib/periods";

export const dynamic = "force-dynamic";

const RANGES: { key: "month" | "quarter" | "ytd"; label: string }[] = [{ key: "month", label: "Month" }, { key: "quarter", label: "Quarter" }, { key: "ytd", label: "YTD" }];
const mdy = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const tsDay = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Denver" });

/**
 * Money. What was invoiced and what actually came in this period, what is
 * still out there, and the invoices that need a nudge — every figure summed
 * from invoices, payments and expenses, nothing estimated.
 */
export default async function Accounting({ searchParams }: { searchParams: { range?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const period = periodFor(parseRange(searchParams.range));

  const [{ data: invoices }, { data: payments }, { data: expenses }, { data: customers }, { data: jobs }, { data: proofs }, { data: margins }, { data: payroll }] = await Promise.all([
    db.from("invoices").select("id, number, customer_id, total, status, due_date, sent_at, created_at, line_items, customers(full_name)").order("created_at", { ascending: false }).limit(2000),
    db.from("payments").select("invoice_id, amount, paid_at").order("paid_at", { ascending: false }).limit(5000),
    db.from("expenses").select("amount, expense_date").limit(5000),
    db.from("customers").select("id, full_name, phone").neq("status", "opted_out").order("full_name"),
    db.from("jobs").select("customer_id, status, scheduled_date"),
    db.from("service_proofs").select("id, statement, minutes_on_site, departure_at, method, closest_meters, customers(full_name)").order("created_at", { ascending: false }).limit(8),
    db.from("v_client_margin").select("*").order("margin_per_visit", { ascending: true }).limit(6),
    db.from("v_payroll_rollup").select("*").order("period_start", { ascending: false }).limit(4),
  ]);

  const inv = (invoices ?? []) as any[];
  const pay = (payments ?? []) as any[];
  const exp = (expenses ?? []) as any[];
  const inPeriod = (ts: string, p = period as { startTs: string; endTs: string }) => ts >= p.startTs && ts < p.endTs;
  const inDates = (d: string, p = period as { start: string; end: string }) => d >= p.start && d < p.end;

  const billed = inv.filter((i) => !["void", "draft"].includes(i.status) && inPeriod(i.created_at));
  const invoiced = billed.reduce((s, i) => s + Number(i.total), 0);
  const collected = pay.filter((p) => inPeriod(p.paid_at)).reduce((s, p) => s + Number(p.amount), 0);
  const costs = exp.filter((e) => inDates(e.expense_date)).reduce((s, e) => s + Number(e.amount), 0);
  const net = collected - costs;
  const prevCollected = pay.filter((p) => inPeriod(p.paid_at, period.prev)).reduce((s, p) => s + Number(p.amount), 0);
  const prevCosts = exp.filter((e) => inDates(e.expense_date, period.prev)).reduce((s, e) => s + Number(e.amount), 0);
  const prevNet = prevCollected - prevCosts;
  const netDelta = prevNet > 0 ? Math.round(((net - prevNet) / prevNet) * 100) : null;

  const open = inv.filter((i) => ["sent", "overdue"].includes(i.status));
  const outstanding = open.reduce((s, i) => s + Number(i.total), 0);
  const overdue = open.filter((i) => i.status === "overdue" || (i.due_date && i.due_date < period.today));
  const overdueTotal = overdue.reduce((s, i) => s + Number(i.total), 0);
  const daysLate = (i: any) => (i.due_date ? Math.max(0, Math.round((new Date(period.today + "T12:00:00").getTime() - new Date(i.due_date + "T12:00:00").getTime()) / 86400_000)) : 0);
  const attention = [...open].sort((a, b) => daysLate(b) - daysLate(a) || (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 6);

  // Collected by week — the last eight Monday-start weeks, summed from payments.
  const t = new Date(period.today + "T12:00:00");
  const dow = (t.getDay() + 6) % 7; // Mon=0
  const thisMon = new Date(t.getTime() - dow * 86400_000);
  const weeks = Array.from({ length: 8 }, (_, k) => {
    const s = new Date(thisMon.getTime() - (7 - k) * 7 * 86400_000);
    const e = new Date(s.getTime() + 7 * 86400_000);
    return { start: s.toLocaleDateString("en-CA"), end: e.toLocaleDateString("en-CA"), v: 0 };
  });
  for (const p of pay) { const d = tsDay(p.paid_at); const w = weeks.find((x) => d >= x.start && d < x.end); if (w) w.v += Number(p.amount); }
  const weekMax = Math.max(0, ...weeks.map((w) => w.v));

  // Ledger (kept from the previous page) — one row per account.
  const custName = (id: string | null) => (customers ?? []).find((c) => c.id === id)?.full_name ?? "—";
  const paidByInvoice = new Map<string, number>();
  for (const p of pay) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));
  const ledger = (customers ?? []).map((c) => {
    const mine = (jobs ?? []).filter((j) => j.customer_id === c.id);
    const done = mine.filter((j) => j.status === "completed");
    const myInv = inv.filter((i) => i.customer_id === c.id && i.status !== "void" && i.status !== "draft");
    const billedTotal = myInv.reduce((s, i) => s + Number(i.total), 0);
    const paidTotal = myInv.reduce((s, i) => s + (paidByInvoice.get(i.id) ?? 0), 0);
    return { ...c, visits: done.length, upcoming: mine.filter((j) => j.status === "scheduled").length, lastSvc: done.map((j) => j.scheduled_date).sort().at(-1) ?? null, billed: billedTotal, paid: paidTotal, balance: billedTotal - paidTotal };
  });

  const seg = (k: string) => `/crm/accounting${k === "month" ? "" : `?range=${k}`}`;
  const firstLine = (i: any) => (Array.isArray(i.line_items) && i.line_items[0]?.service) || "Invoice";
  const cell = "px-4 py-3.5";

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <nav className="mo-eyebrow flex items-center gap-1.5">
            <Link href="/crm/more" className="transition hover:text-[color:var(--ink)]">‹ More</Link>
            <span className="text-[color:var(--faint)]">/</span>
            <span>Accounting</span>
          </nav>
          <LinkButton href="/crm/accounting/invoices/new">+ Invoice</LinkButton>
        </div>

        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mo-eyebrow">{period.label}</div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">Money</h1>
          </div>
          <div className="flex shrink-0 rounded-full border border-[color:var(--border)] bg-black/30 p-1">
            {RANGES.map((r) => (
              <Link key={r.key} href={seg(r.key)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${period.range === r.key ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"}`}>{r.label}</Link>
            ))}
          </div>
        </div>

        <div className="mo-card aiv-glow mb-4 grid grid-cols-2 p-0">
          <div className={`${cell} border-b border-r border-[color:var(--border)]`}>
            <div className="mo-eyebrow text-[9px]">Invoiced</div>
            <div className="mo-num mt-2 text-[24px] leading-none text-[color:var(--ink)]">{money(invoiced)}</div>
            <div className="mo-mono mt-1.5 text-[11px] text-[color:var(--body)]">{billed.length} invoice{billed.length === 1 ? "" : "s"}</div>
          </div>
          <div className={`${cell} border-b border-[color:var(--border)]`}>
            <div className="mo-eyebrow text-[9px]">Collected</div>
            <div className={`mo-num mt-2 text-[24px] leading-none ${collected > 0 ? "text-gold" : "text-[color:var(--ink)]"}`}>{money(collected)}</div>
            <div className="mo-mono mt-1.5 text-[11px] text-[color:var(--body)]">{invoiced > 0 ? `${Math.round((collected / invoiced) * 100)}% of invoiced` : "nothing invoiced yet"}</div>
          </div>
          <div className={`${cell} border-r border-[color:var(--border)]`}>
            <div className="mo-eyebrow text-[9px]">Outstanding</div>
            <div className="mo-num mt-2 text-[24px] leading-none text-[color:var(--ink)]">{money(outstanding)}</div>
            <div className={`mo-mono mt-1.5 text-[11px] ${overdue.length ? "text-coral" : "text-[color:var(--body)]"}`}>{overdue.length ? `${overdue.length} overdue · ${money(overdueTotal)}` : open.length ? "none overdue" : "all clear"}</div>
          </div>
          <div className={cell}>
            <div className="mo-eyebrow text-[9px]">Net after costs</div>
            <div className={`mo-num mt-2 text-[24px] leading-none ${net < 0 ? "text-coral" : "text-[color:var(--ink)]"}`}>{money(net)}</div>
            <div className={`mo-mono mt-1.5 text-[11px] ${netDelta == null ? "text-[color:var(--body)]" : netDelta >= 0 ? "text-sage" : "text-coral"}`}>{netDelta == null ? `no ${period.prev.short} to compare` : `${netDelta >= 0 ? "+" : ""}${netDelta}% vs ${period.prev.short}`}</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="mo-eyebrow mb-2">Collected · by week</div>
          <div className="mo-card px-3.5 pb-2.5 pt-3">
            {weekMax > 0 ? (
              <div className="flex h-16 items-end gap-1.5" role="img" aria-label={`Collected by week: ${weeks.map((w) => `${mdy(w.start)} ${money(w.v)}`).join(", ")}`}>
                {weeks.map((w) => (
                  <span key={w.start} className="flex-1 rounded-[3px]" title={`${mdy(w.start)} · ${money(w.v)}`} style={{ height: `${Math.max(w.v > 0 ? 6 : 2, (w.v / weekMax) * 100)}%`, background: w.v > 0 ? "#7ac1c9" : "rgba(255,255,255,0.08)" }} />
                ))}
              </div>
            ) : (
              <div className="flex h-16 flex-col items-center justify-center gap-1">
                <span className="h-px w-full bg-white/10" />
                <span className="mo-mono text-[11px] text-[color:var(--body)]">No payments in the last 8 weeks</span>
              </div>
            )}
            <div className="mo-mono mt-1.5 flex justify-between text-[10px] text-[color:var(--body)]"><span>{mdy(weeks[0].start)}</span><span>{mdy(weeks[7].start)}</span></div>
          </div>
        </div>

        <div className="mo-card mb-4 p-0">
          <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3">
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Needs attention</span>
            <Link href="/crm/accounting/invoices" className="mo-eyebrow text-teal">All invoices</Link>
          </div>
          {attention.map((i) => {
            const late = daysLate(i);
            return (
              <Link key={i.id} href={`/crm/accounting/invoices/${i.id}`} className="flex items-center gap-3 border-t border-[color:var(--border)] px-4 py-3 transition hover:bg-white/[0.03]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-[color:var(--ink)]">{i.customers?.full_name ?? custName(i.customer_id)} · MOM-{i.number}</span>
                  <span className="block truncate text-[12px] text-[color:var(--body)]">{firstLine(i)}{i.due_date ? ` · due ${mdy(i.due_date)}` : ""}</span>
                </span>
                <span className="mo-mono text-[13px] text-[color:var(--ink)]">{money(Number(i.total))}</span>
                <span className={`mo-eyebrow rounded-full border px-2 py-0.5 text-[9px] ${late > 0 ? "border-coral/50 text-coral" : "border-[color:var(--border)]"}`}>{late > 0 ? `${late} d late` : i.sent_at && tsDay(i.sent_at) === period.today ? "Sent today" : "Sent"}</span>
              </Link>
            );
          })}
          {!attention.length && <p className="border-t border-[color:var(--border)] px-4 py-4 text-[13px] text-[color:var(--body)]">Nothing waiting on a payment{inv.length ? "" : " — invoices draft themselves when a visit completes"}.</p>}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-2">
          <Link href="/crm/expenses" className="mo-card px-3.5 py-3 transition hover:border-white/20">
            <div className="mo-eyebrow text-[9px]">Expenses · {period.short}</div>
            <div className="mo-num mt-1.5 text-[18px] text-[color:var(--ink)]">{money(costs)}</div>
          </Link>
          <Link href={`/crm/accounting/pnl${period.range === "month" ? "" : `?range=${period.range}`}`} className="mo-card px-3.5 py-3 transition hover:border-white/20">
            <div className="mo-eyebrow text-[9px]">P&amp;L</div>
            <div className={`mo-num mt-1.5 text-[18px] ${net > 0 ? "text-sage" : net < 0 ? "text-coral" : "text-[color:var(--ink)]"}`}>{money(net)} net</div>
          </Link>
        </div>

        {/* ===== Below the designed screen: the ledger and labor views this page already had ===== */}
        <BandCard title="Account ledger" sub="all-time, every account" className="mb-4 !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="mo-eyebrow border-b border-[color:var(--border)] text-left">
                  <th className="px-5 py-3">Account</th><th className="px-4 py-3">Visits</th><th className="px-4 py-3">Upcoming</th>
                  <th className="px-4 py-3">Last visit</th><th className="px-4 py-3 text-right">Invoiced</th><th className="px-4 py-3 text-right">Paid</th><th className="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {ledger.map((r) => (
                  <tr key={r.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-5 py-3"><Link href={`/crm/customers/${r.id}`} className="font-medium text-[color:var(--ink)] hover:text-teal">{r.full_name}</Link></td>
                    <td className="px-4 py-3 text-[color:var(--ink)]">{r.visits}</td>
                    <td className="px-4 py-3 text-[color:var(--ink)]">{r.upcoming}</td>
                    <td className="px-4 py-3 text-[color:var(--body)]">{r.lastSvc ? mdy(r.lastSvc) : "—"}</td>
                    <td className="mo-mono px-4 py-3 text-right text-[color:var(--ink)]">{money(r.billed, true)}</td>
                    <td className="mo-mono px-4 py-3 text-right text-sage">{money(r.paid, true)}</td>
                    <td className={`mo-mono px-5 py-3 text-right font-semibold ${r.balance > 0 ? "text-gold" : "text-[color:var(--ink)]"}`}>{money(r.balance, true)}</td>
                  </tr>
                ))}
                {!ledger.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[color:var(--body)]">No accounts yet — closed leads become accounts here.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mo-eyebrow flex gap-3 border-t border-[color:var(--border)] px-5 py-3">
            <span>CSV</span>
            {["invoices", "payments", "expenses"].map((e) => <a key={e} className="text-teal" href={`/api/crm/export?entity=${e}`}>{e}</a>)}
          </div>
        </BandCard>

        <BandCard title="Proof of service" sub="GPS-verified visits" className="mb-4">
          <div className="space-y-2">
            {(proofs ?? []).map((p: any) => (
              <div key={p.id} className="flex items-start gap-3 rounded-xl border border-[color:var(--border)] px-3.5 py-3">
                <span className="mt-0.5 text-sage">✓</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-[color:var(--ink)]">{p.statement}</span>
                  <span className="mt-0.5 block text-[11px] text-[color:var(--body)]">{p.customers?.full_name ?? "Client"} · {p.minutes_on_site} min on site · within {Math.round(p.closest_meters ?? 0)} m · {p.method === "gps_auto" ? "verified automatically" : p.method}</span>
                </span>
                <span className="mo-mono shrink-0 text-[11px] text-[color:var(--faint)]">{p.departure_at ? new Date(p.departure_at).toLocaleDateString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric" }) : ""}</span>
              </div>
            ))}
            {!(proofs ?? []).length && <p className="py-2 text-sm text-[color:var(--body)]">No verified visits yet. Once a crew phone is on site for the required time, the visit closes itself and the proof lands here.</p>}
          </div>
        </BandCard>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <BandCard title="Thinnest margins" sub="$/visit vs. minutes on site">
            <div className="space-y-1.5">
              {(margins ?? []).map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 flex-1 truncate text-[color:var(--body)]">{m.customer_name ?? "—"} · {m.minutes_on_site} min</span>
                  <span className={`mo-mono font-semibold ${m.margin_per_visit < 0 ? "text-coral" : "text-[color:var(--ink)]"}`}>{money(Number(m.margin_per_visit ?? 0), true)}</span>
                </div>
              ))}
              {!(margins ?? []).length && <p className="py-2 text-sm text-[color:var(--body)]">No GPS-verified visits with a labor cost yet.</p>}
            </div>
          </BandCard>
          <BandCard title="Payroll rollup" sub="weekly · GPS service + drive">
            <div className="space-y-1.5">
              {(payroll ?? []).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[color:var(--body)]">{p.period_start} · {p.total_hours} h ({p.drive_minutes} min drive)</span>
                  <span className="mo-mono font-semibold text-[color:var(--ink)]">{p.total_cost != null ? money(Number(p.total_cost), true) : "rate not set"}</span>
                </div>
              ))}
              {!(payroll ?? []).length && <p className="py-2 text-sm text-[color:var(--body)]">No payroll periods yet. Set hourly rates in crew_rates to start computing cost.</p>}
            </div>
          </BandCard>
        </div>
      </div>
    </Shell>
  );
}
