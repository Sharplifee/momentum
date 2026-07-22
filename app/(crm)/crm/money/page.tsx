import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MoneyActions } from "@/components/crm/MoneyActions";
import { INVOICE_STYLE } from "@/lib/theme";
import { Chip } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Money({ searchParams }: { searchParams: { status?: string } }) {
  const { profile, role, db } = await requireStaff(["owner"]);
  let q = db.from("invoices").select("id, number, total, subtotal, tax, status, due_date, sent_at, created_at, reminders_sent, line_items, customers(full_name, phone)").order("created_at", { ascending: false }).limit(100);
  if (searchParams.status) q = q.eq("status", searchParams.status);
  const { data: invoices } = await q;
  const { data: allInv } = await db.from("invoices").select("total, status, created_at");
  const monthStart = new Date(); monthStart.setDate(1);
  const outstanding = (allInv ?? []).filter((i: any) => ["sent", "overdue"].includes(i.status)).reduce((s: number, i: any) => s + Number(i.total), 0);
  const paidMonth = (allInv ?? []).filter((i: any) => i.status === "paid" && new Date(i.created_at) >= monthStart).reduce((s: number, i: any) => s + Number(i.total), 0);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Money</h1>
        <Link href="/crm/money/pnl" className="rounded-lg bg-teal px-3 py-2 text-sm text-white">P&L →</Link>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="mo-card p-4"><div className="text-xs text-[color:var(--body)]">Outstanding</div><div className="mt-0.5 text-2xl font-bold text-[color:var(--ink)]">${outstanding.toFixed(0)}</div></div>
        <div className="mo-card p-4"><div className="text-xs text-[color:var(--body)]">Paid this month</div><div className="mt-0.5 text-2xl font-bold text-emerald-600">${paidMonth.toFixed(0)}</div></div>
      </div>
      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-black/[0.04] p-1">
        {["", "draft", "sent", "paid", "overdue", "void"].map((s) => (
          <Link key={s || "all"} href={s ? `/crm/money?status=${s}` : "/crm/money"}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${searchParams.status === s || (!searchParams.status && !s) ? "bg-white text-[color:var(--ink)] shadow-sm dark:bg-white/15" : "text-[color:var(--body)] hover:text-[color:var(--ink)]"}`}>
            {s || "All"}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {(invoices ?? []).map((inv: any) => (
          <div key={inv.id} className="mo-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold">MOM-{inv.number}</span>
                <span className="ml-2 text-sm text-slate">{inv.customers?.full_name} · due {inv.due_date ?? "—"}{inv.reminders_sent ? ` · ${inv.reminders_sent} reminder(s)` : ""}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">${Number(inv.total).toFixed(2)}</span>
                <Chip className={INVOICE_STYLE[inv.status] ?? "bg-ice/15 text-slate"}>{inv.status}</Chip>
              </div>
            </div>
            <div className="mt-1 text-xs text-slate/70">{(inv.line_items ?? []).map((l: any) => `${l.service} ${l.date ?? ""} $${l.price}`).join(" · ")} — subtotal ${Number(inv.subtotal ?? 0).toFixed(2)} + tax ${Number(inv.tax ?? 0).toFixed(2)}</div>
            <MoneyActions invoice={{ id: inv.id, status: inv.status, phone: inv.customers?.phone ?? null }} />
          </div>
        ))}
        {!invoices?.length && <p className="text-slate/70">No invoices yet — they draft automatically when jobs complete.</p>}
      </div>
      <div className="mt-6 text-sm">
        CSV: {["invoices", "payments", "expenses"].map((e) => <a key={e} className="mr-3 underline" href={`/api/crm/export?entity=${e}`}>{e}</a>)}
      </div>
    </Shell>
  );
}
