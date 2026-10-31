import Link from "next/link";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { LinkButton, EmptyState } from "@/components/ui";
import { money } from "@/lib/periods";

export const dynamic = "force-dynamic";

const STATUSES = ["", "draft", "sent", "overdue", "paid", "void"];
const LABEL: Record<string, string> = { "": "All", draft: "Draft", sent: "Sent", overdue: "Overdue", paid: "Paid", void: "Void" };
const TONE: Record<string, string> = { draft: "border-[color:var(--border)]", sent: "border-teal/50 text-teal", overdue: "border-coral/50 text-coral", paid: "border-gold/60 text-gold", void: "border-[color:var(--border)] text-[color:var(--faint)]", refunded: "border-ice/40 text-ice" };
const mdy = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });

/** Every invoice, newest first, with the status chips. Tap one for its sheet. */
export default async function InvoicesPage({ searchParams }: { searchParams: { status?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const st = searchParams.status ?? "";
  let q = db.from("invoices").select("id, number, total, status, due_date, sent_at, created_at, line_items, customers(full_name)").order("created_at", { ascending: false }).limit(200);
  if (st) q = q.eq("status", st);
  const [{ data: invoices }, { data: all }] = await Promise.all([q, db.from("invoices").select("status")]);
  const counts: Record<string, number> = {};
  for (const i of all ?? []) counts[i.status] = (counts[i.status] ?? 0) + 1;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <nav className="mo-eyebrow flex items-center gap-1.5">
            <Link href="/crm/accounting" className="transition hover:text-[color:var(--ink)]">‹ Accounting</Link>
            <span className="text-[color:var(--faint)]">/</span>
            <span>Invoices</span>
          </nav>
          <LinkButton href="/crm/accounting/invoices/new">+ Invoice</LinkButton>
        </div>
        <h1 className="mb-4 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">Invoices</h1>

        <div className="mb-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          {STATUSES.map((s) => (
            <Link key={s || "all"} href={s ? `/crm/accounting/invoices?status=${s}` : "/crm/accounting/invoices"} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${st === s ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>
              {LABEL[s]} {s && <span className={st === s ? "text-[#0a0a0a]/60" : "text-[color:var(--faint)]"}>{counts[s] ?? 0}</span>}
            </Link>
          ))}
        </div>

        {!invoices?.length ? (
          <EmptyState title={st ? `No ${LABEL[st].toLowerCase()} invoices` : "No invoices yet"} hint={st ? "Nothing in this status right now." : "Visits invoice themselves on completion. Extras and one-offs start with + Invoice."} action={<LinkButton href="/crm/accounting/invoices/new">+ Invoice</LinkButton>} />
        ) : (
          <div className="mo-card p-0">
            {(invoices as any[]).map((i, idx) => {
              const late = ["sent", "overdue"].includes(i.status) && i.due_date && i.due_date < today ? Math.round((new Date(today + "T12:00:00").getTime() - new Date(i.due_date + "T12:00:00").getTime()) / 86400_000) : 0;
              return (
                <Link key={i.id} href={`/crm/accounting/invoices/${i.id}`} className={`flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03] ${idx ? "border-t border-[color:var(--border)]" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-[color:var(--ink)]">{i.customers?.full_name ?? "—"} · MOM-{i.number}</span>
                    <span className="block truncate text-[12px] text-[color:var(--body)]">{i.line_items?.[0]?.service ?? "Invoice"}{i.due_date ? ` · due ${mdy(i.due_date)}` : ` · ${mdy(i.created_at)}`}</span>
                  </span>
                  <span className="mo-mono text-[13px] text-[color:var(--ink)]">{money(Number(i.total), Number(i.total) % 1 !== 0)}</span>
                  <span className={`mo-eyebrow rounded-full border px-2 py-0.5 text-[9px] ${late > 0 ? "border-coral/50 text-coral" : TONE[i.status] ?? ""}`}>{late > 0 ? `${late} d late` : LABEL[i.status] ?? i.status}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
