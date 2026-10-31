import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MoneyActions } from "@/components/crm/MoneyActions";
import { getBillingConfig, displayNumber } from "@/lib/invoices";
import { money } from "@/lib/periods";

export const dynamic = "force-dynamic";

const mdy = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });
const STATUS_TONE: Record<string, string> = { paid: "text-gold", overdue: "text-coral", sent: "text-coral", draft: "text-[color:var(--body)]", void: "text-[color:var(--faint)]", refunded: "text-ice" };
const STATUS_WORD: Record<string, string> = { paid: "Paid", overdue: "Unpaid", sent: "Unpaid", draft: "Draft", void: "Void", refunded: "Refunded" };

/**
 * One invoice: the lines, every text that went out about it, and the two
 * things you do with an unpaid one — resend the link or mark it paid.
 */
export default async function InvoicePage({ params }: { params: { id: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const { data: inv } = await db.from("invoices")
    .select("id, number, customer_id, job_id, subtotal, tax, total, status, due_date, sent_at, created_at, reminders_sent, void_reason, line_items, customers(id, full_name, phone, email)")
    .eq("id", params.id).maybeSingle();
  if (!inv) notFound();
  const i: any = inv;
  const cust = i.customers;
  const cfg = await getBillingConfig();
  const num = displayNumber(cfg.invoice_prefix, i.number);
  const lines: any[] = Array.isArray(i.line_items) ? i.line_items : [];
  const jobIds = [i.job_id, ...lines.map((l) => l.job_id)].filter(Boolean) as string[];

  const [{ data: prop }, { data: jobs }, { data: proofs }, { data: payments }, { data: texts }, { data: thread }] = await Promise.all([
    db.from("properties").select("address, city").eq("customer_id", i.customer_id).order("created_at").limit(1).maybeSingle(),
    jobIds.length ? db.from("jobs").select("id, scheduled_date, arrival_at, departure_at, crews(name)").in("id", jobIds) : Promise.resolve({ data: [] as any[] }),
    jobIds.length ? db.from("service_proofs").select("job_id, minutes_on_site").in("job_id", jobIds) : Promise.resolve({ data: [] as any[] }),
    db.from("payments").select("amount, method, paid_at, note").eq("invoice_id", i.id).order("paid_at"),
    cust?.phone ? db.from("messages").select("body, created_at, meta").eq("direction", "outbound").contains("meta", { to: cust.phone }).ilike("body", `%${num}%`).order("created_at") : Promise.resolve({ data: [] as any[] }),
    db.from("threads").select("id").eq("customer_id", i.customer_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const openStatus = i.status === "sent" || i.status === "overdue";
  const late = openStatus && i.due_date && i.due_date < today ? Math.round((new Date(today + "T12:00:00").getTime() - new Date(i.due_date + "T12:00:00").getTime()) / 86400_000) : 0;
  const netDays = i.sent_at && i.due_date ? Math.round((new Date(i.due_date + "T12:00:00").getTime() - new Date(new Date(i.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Denver" }) + "T12:00:00").getTime()) / 86400_000) : null;
  const title = lines[0]?.service ?? "Invoice";
  const subline = [i.sent_at ? `Sent ${mdy(i.sent_at)}` : `Drafted ${mdy(i.created_at)}`, i.due_date ? `due ${mdy(i.due_date)}` : null, netDays != null ? (netDays === 0 ? "on receipt" : `net ${netDays}`) : null].filter(Boolean).join(" · ");
  const proofBy = new Map((proofs ?? []).map((p: any) => [p.job_id, p]));
  const visits = (jobs ?? []).map((j: any) => {
    const pr = proofBy.get(j.id);
    const mins = pr?.minutes_on_site ?? (j.arrival_at && j.departure_at ? Math.round((new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 60_000) : null);
    const dur = mins != null ? (mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} m` : `${mins} min`) : null;
    return { id: j.id, text: [`Visit ${mdy(j.scheduled_date)}`, j.crews?.name, dur, pr ? "verified" : j.arrival_at ? "arrived" : null].filter(Boolean).join(" · ") };
  });

  const reminderLabel = (body: string) => /friendly reminder/i.test(body) ? "Friendly reminder" : /pay online|pay:/i.test(body) ? "Invoice text + pay link" : "Text";
  const delivery = (m: any) => m.meta?.delivery === "SMS_DELIVERED" ? "delivered" : m.meta?.delivery === "SMS_FAILED" ? "failed" : m.meta?.dry_run ? "dry run" : "sent";

  const KV = ({ k, v, tone = "" }: { k: React.ReactNode; v: React.ReactNode; tone?: string }) => (
    <div className="flex items-start justify-between gap-4 border-t border-[color:var(--border)] py-2.5 text-[14px] first:border-t-0">
      <span className={tone || "text-[color:var(--ink)]"}>{k}</span>
      <span className="mo-mono shrink-0 text-right text-[color:var(--ink)]">{v}</span>
    </div>
  );

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl pb-28 md:pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <nav className="mo-eyebrow flex min-w-0 items-center gap-1.5">
            <Link href="/crm/accounting" className="shrink-0 transition hover:text-[color:var(--ink)]">‹ Accounting</Link>
            <span className="text-[color:var(--faint)]">/</span>
            <span className="truncate">{num}</span>
          </nav>
          <span className={`mo-eyebrow shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${late > 0 ? "border-coral/50 text-coral" : i.status === "paid" ? "border-gold/60 text-gold" : "border-[color:var(--border)]"}`}>
            {late > 0 ? `${late} d late` : STATUS_WORD[i.status] ?? i.status}
          </span>
        </div>

        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mo-eyebrow truncate">
              <Link href={`/crm/customers/${i.customer_id}`} className="hover:text-[color:var(--ink)]">{cust?.full_name ?? "Customer"}</Link>{prop?.address ? ` · ${prop.address}` : ""}
            </div>
            <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">{title}</h1>
            <p className="mt-1 text-[13px] text-[color:var(--body)]">{subline}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="mo-num text-[26px] leading-none text-[color:var(--ink)]">{money(Number(i.total), Number(i.total) % 1 !== 0)}</div>
            <div className={`mo-eyebrow mt-1 ${STATUS_TONE[i.status] ?? ""}`}>{STATUS_WORD[i.status] ?? i.status}</div>
          </div>
        </div>

        <section className="mo-card aiv-glow mb-3 px-4 pb-1 pt-3.5">
          <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Lines</h2>
          {lines.map((l, idx) => <KV key={idx} k={`${l.service}${l.date ? ` · ${mdy(l.date)}` : ""}${l.qty && l.qty > 1 ? ` × ${l.qty}` : ""}`} v={money(Number(l.price) * (l.qty ?? 1), true)} />)}
          {!lines.length && <KV k="No line items" v="" tone="text-[color:var(--body)]" />}
          {visits.map((v) => <KV key={v.id} k={<Link href={`/crm/jobs/${v.id}`} className="hover:text-[color:var(--ink)]">{v.text}</Link>} v="" tone="text-[color:var(--body)]" />)}
          {Number(i.tax) > 0 && <KV k={cfg.tax_label} v={money(Number(i.tax), true)} tone="text-[color:var(--body)]" />}
          <div className="flex items-center justify-between border-t border-[color:var(--border-strong)] py-2.5">
            <span className="mo-eyebrow">Total</span>
            <span className="mo-num text-[18px] text-[color:var(--ink)]">{money(Number(i.total), true)}</span>
          </div>
        </section>

        <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
          <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Reminders</h2>
          {(texts ?? []).map((m: any, idx: number) => {
            const d = delivery(m);
            return (
              <div key={idx} className="flex items-start justify-between gap-3 border-t border-[color:var(--border)] py-2.5 text-[14px] first:border-t-0">
                <span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">{mdy(m.created_at)}</span>
                <span className={`text-right ${d === "failed" ? "text-coral" : "text-[color:var(--ink)]"}`}>{reminderLabel(m.body)} · {d}</span>
              </div>
            );
          })}
          {(payments ?? []).map((p: any, idx: number) => (
            <div key={`p${idx}`} className="flex items-start justify-between gap-3 border-t border-[color:var(--border)] py-2.5 text-[14px] first:border-t-0">
              <span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">{mdy(p.paid_at)}</span>
              <span className="text-right text-gold">Paid {money(Number(p.amount), true)} · {p.method ?? "—"}{p.note ? ` · ${p.note}` : ""}</span>
            </div>
          ))}
          {i.status === "void" && <div className="border-t border-[color:var(--border)] py-2.5 text-[14px] text-[color:var(--body)] first:border-t-0">Voided{i.void_reason ? ` · ${i.void_reason}` : ""}</div>}
          {!(texts ?? []).length && !(payments ?? []).length && i.status !== "void" && (
            <p className="py-2 text-[13px] text-[color:var(--body)]">{i.status === "draft" ? "Not sent yet." : i.reminders_sent ? `${i.reminders_sent} reminder${i.reminders_sent === 1 ? "" : "s"} sent — texts before the log started aren't listed.` : "No texts about this invoice yet. Past-due invoices get a reminder automatically."}</p>
          )}
        </section>

        <MoneyActions invoice={{ id: i.id, status: i.status, total: Number(i.total), phone: cust?.phone ?? null, firstName: (cust?.full_name ?? "customer").split(" ")[0], threadId: thread?.id ?? null }} />
      </div>
    </Shell>
  );
}
