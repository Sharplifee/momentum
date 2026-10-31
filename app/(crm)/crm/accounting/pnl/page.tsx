import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { parseRange, periodFor, lastMonths, money } from "@/lib/periods";

export const dynamic = "force-dynamic";

const RANGES: { key: "month" | "quarter" | "ytd"; label: string }[] = [{ key: "month", label: "Month" }, { key: "quarter", label: "Quarter" }, { key: "ytd", label: "YTD" }];
const FIELD_COSTS = new Set(["fuel", "dump", "supplies", "equipment", "materials"]);
const revenueGroup = (service: string) => /lawn maintenance|mow/i.test(service) ? "Weekly & biweekly mowing" : /aeration/i.test(service) ? "Aeration" : "Cleanups & one-offs";

/**
 * Profit and loss, from the ledger up: collected payments split by what they
 * paid for, expenses split field vs. overhead, net. Every number is a sum of
 * rows that exist — an empty month reads as zero, never as a sample.
 */
export default async function Pnl({ searchParams }: { searchParams: { range?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const period = periodFor(parseRange(searchParams.range));
  const months = lastMonths(7);
  const earliestTs = months[0].startTs < period.startTs ? months[0].startTs : period.startTs;
  const earliest = months[0].start < period.start ? months[0].start : period.start;

  const [{ data: payments }, { data: expenses }, { count: visits }, { data: proofs }] = await Promise.all([
    db.from("payments").select("amount, paid_at, invoice_id").gte("paid_at", earliestTs).limit(5000),
    db.from("expenses").select("amount, category, expense_date").gte("expense_date", earliest).limit(5000),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("scheduled_date", period.start).lt("scheduled_date", period.end),
    db.from("service_proofs").select("minutes_on_site").gte("arrival_at", period.startTs).lt("arrival_at", period.endTs),
  ]);
  const pay = (payments ?? []) as any[];
  const exp = (expenses ?? []) as any[];
  const inPay = pay.filter((p) => p.paid_at >= period.startTs && p.paid_at < period.endTs);
  const inExp = exp.filter((e) => e.expense_date >= period.start && e.expense_date < period.end);

  // Revenue by what it paid for — each payment split across its invoice's lines.
  const invIds = [...new Set(inPay.map((p) => p.invoice_id).filter(Boolean))] as string[];
  const { data: invs } = invIds.length ? await db.from("invoices").select("id, line_items, subtotal").in("id", invIds) : { data: [] as any[] };
  const linesBy = new Map((invs ?? []).map((i: any) => [i.id, Array.isArray(i.line_items) ? i.line_items : []]));
  const revenue: Record<string, number> = {};
  for (const p of inPay) {
    const amt = Number(p.amount);
    const lines = (linesBy.get(p.invoice_id) ?? []) as any[];
    const lineTotal = lines.reduce((s, l) => s + Number(l.price ?? 0) * (l.qty ?? 1), 0);
    if (!lines.length || lineTotal <= 0) { revenue["Other"] = (revenue["Other"] ?? 0) + amt; continue; }
    for (const l of lines) { const g = revenueGroup(String(l.service ?? "")); revenue[g] = (revenue[g] ?? 0) + amt * ((Number(l.price ?? 0) * (l.qty ?? 1)) / lineTotal); }
  }
  const collected = inPay.reduce((s, p) => s + Number(p.amount), 0);
  const field = inExp.filter((e) => FIELD_COSTS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
  const overhead = inExp.filter((e) => !FIELD_COSTS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
  const costs = field + overhead;
  const net = collected - costs;

  const byMonth = months.map((m) => ({
    ...m,
    v: pay.filter((p) => p.paid_at >= m.startTs && p.paid_at < m.endTs).reduce((s, p) => s + Number(p.amount), 0)
      - exp.filter((e) => e.expense_date >= m.start && e.expense_date < m.end).reduce((s, e) => s + Number(e.amount), 0),
  }));
  const absMax = Math.max(0, ...byMonth.map((m) => Math.abs(m.v)));
  const hasMonths = byMonth.some((m) => m.v !== 0);

  const hours = (proofs ?? []).reduce((s, p: any) => s + Number(p.minutes_on_site ?? 0), 0) / 60;
  const perVisit = visits ? collected / visits : null;
  const perHour = hours > 0 ? net / hours : null;
  const margin = collected > 0 ? Math.round((net / collected) * 100) : null;

  const KV = ({ k, v, indent = false, tone = "" }: { k: string; v: React.ReactNode; indent?: boolean; tone?: string }) => (
    <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border)] py-2.5 text-[14px] first:border-t-0">
      <span className={indent ? "pl-3 text-[color:var(--body)]" : "text-[color:var(--ink)]"}>{k}</span>
      <span className={`${indent ? "mo-mono text-[color:var(--ink)]" : `mo-num text-[15px] ${tone || "text-[color:var(--ink)]"}`}`}>{v}</span>
    </div>
  );
  const seg = (k: string) => `/crm/accounting/pnl${k === "month" ? "" : `?range=${k}`}`;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <nav className="mo-eyebrow mb-4 flex items-center gap-1.5">
          <Link href="/crm/accounting" className="transition hover:text-[color:var(--ink)]">‹ Accounting</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span>P&amp;L</span>
        </nav>

        <div className="mb-4 flex items-end justify-between gap-3">
          <div><div className="mo-eyebrow">{period.span}</div><h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">P&amp;L</h1></div>
          <div className="flex shrink-0 rounded-full border border-[color:var(--border)] bg-black/30 p-1">
            {RANGES.map((r) => <Link key={r.key} href={seg(r.key)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${period.range === r.key ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"}`}>{r.label}</Link>)}
          </div>
        </div>

        <div className="mo-card aiv-glow mb-4 px-4 pb-1 pt-3.5">
          <KV k="Revenue · collected" v={money(collected)} />
          {Object.entries(revenue).sort((a, b) => b[1] - a[1]).map(([k, v]) => <KV key={k} k={k} v={money(v)} indent />)}
          {!collected && <KV k="No payments in this period" v="" indent />}
          <KV k="Direct costs" v={costs ? `−${money(costs)}` : money(0)} tone={costs ? "text-coral" : ""} />
          {field > 0 && <KV k="Fuel · dump · supplies · equipment" v={money(field)} indent />}
          {overhead > 0 && <KV k="Software, fees & other" v={money(overhead)} indent />}
          {!costs && <KV k="No expenses logged" v="" indent />}
          <div className="flex items-center justify-between border-t border-[color:var(--border-strong)] py-2.5">
            <span className="mo-eyebrow">Net profit</span>
            <span className={`mo-num text-[20px] ${net > 0 ? "text-gold" : net < 0 ? "text-coral" : "text-[color:var(--ink)]"}`}>{money(net)}</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="mo-eyebrow mb-2">Net by month · {months[0].key.slice(0, 4) === months[6].key.slice(0, 4) ? months[6].key.slice(0, 4) : `${months[0].short} ${months[0].key.slice(0, 4)} – ${months[6].short} ${months[6].key.slice(0, 4)}`}</div>
          <div className="mo-card px-3.5 pb-2.5 pt-3">
            {hasMonths ? (
              <div className="flex h-[70px] items-end gap-2" role="img" aria-label={`Net by month: ${byMonth.map((m) => `${m.short} ${money(m.v)}`).join(", ")}`}>
                {byMonth.map((m) => (
                  <span key={m.key} className="flex-1 rounded-[3px]" title={`${m.short} · ${money(m.v)}`} style={{ height: `${Math.max(m.v !== 0 ? 6 : 2, (Math.abs(m.v) / absMax) * 100)}%`, background: m.v > 0 ? "#7ac1c9" : m.v < 0 ? "#d9775c" : "rgba(255,255,255,0.08)" }} />
                ))}
              </div>
            ) : (
              <div className="flex h-[70px] flex-col items-center justify-center gap-1"><span className="h-px w-full bg-white/10" /><span className="mo-mono text-[11px] text-[color:var(--body)]">No payments or expenses in these months yet</span></div>
            )}
            <div className="mo-mono mt-1.5 flex justify-between text-[10px] text-[color:var(--body)]">{byMonth.map((m) => <span key={m.key} className="flex-1 text-center">{m.short}</span>)}</div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="mo-card p-3"><div className="mo-eyebrow text-[9px]">Per visit</div><div className="mo-num mt-2 text-[18px] leading-none text-[color:var(--ink)]">{perVisit != null ? money(perVisit) : "—"}</div><div className="mo-mono mt-1 text-[10px] text-[color:var(--body)]">{visits ? `${visits} visit${visits === 1 ? "" : "s"} · avg revenue` : "no completed visits"}</div></div>
          <div className="mo-card p-3"><div className="mo-eyebrow text-[9px]">Margin</div><div className="mo-num mt-2 text-[18px] leading-none text-[color:var(--ink)]">{margin != null ? `${margin}%` : "—"}</div><div className="mo-mono mt-1 text-[10px] text-[color:var(--body)]">{margin != null ? "net of costs" : "no revenue yet"}</div></div>
          <div className="mo-card p-3"><div className="mo-eyebrow text-[9px]">Per hour</div><div className={`mo-num mt-2 text-[18px] leading-none ${perHour != null && perHour > 0 ? "text-sage" : "text-[color:var(--ink)]"}`}>{perHour != null ? money(perHour) : "—"}</div><div className="mo-mono mt-1 text-[10px] text-[color:var(--body)]">{hours > 0 ? `${hours.toFixed(1)} h on site · net` : "no verified hours"}</div></div>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2 rounded-full border border-teal/50 py-3 text-[14px] font-semibold text-[color:var(--ink)]">
          <span>Export · CSV</span>
          {["payments", "expenses", "invoices"].map((e) => <a key={e} href={`/api/crm/export?entity=${e}`} className="text-teal hover:text-[color:var(--ink)]">{e}</a>)}
        </div>
      </div>
    </Shell>
  );
}
