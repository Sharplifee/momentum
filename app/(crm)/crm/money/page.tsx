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

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Money</h1>
        <Link href="/crm/money/pnl" className="rounded-lg bg-teal px-3 py-2 text-sm text-white">P&L →</Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {["", "draft", "sent", "paid", "overdue", "void"].map((s) => (
          <Link key={s || "all"} href={s ? `/crm/money?status=${s}` : "/crm/money"}
            className={`rounded-full px-3 py-1 text-sm ${searchParams.status === s || (!searchParams.status && !s) ? "bg-teal text-white" : "bg-white dark:bg-white/10"}`}>
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
