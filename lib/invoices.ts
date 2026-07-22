import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

type BillingCfg = { tax_rate: number; tax_label: string; invoice_prefix: string; net_days: number; cadence: "per_visit" | "monthly" };

export async function getBillingConfig(): Promise<BillingCfg> {
  const db = supabaseAdmin();
  const { data } = await db.from("system_config").select("value").eq("key", "billing").single();
  const v = (data?.value ?? {}) as Partial<BillingCfg>;
  return {
    tax_rate: v.tax_rate ?? 0.0725,
    tax_label: v.tax_label ?? "Utah sales tax",
    invoice_prefix: v.invoice_prefix ?? "MOM-",
    net_days: v.net_days ?? 7,
    cadence: (v.cadence as BillingCfg["cadence"]) ?? "per_visit",
  };
}

export function displayNumber(prefix: string, n: number | null): string {
  return `${prefix}${n ?? "????"}`;
}

/**
 * Auto-draft an invoice for a completed job (A9 extension, Phase 4 §2.2).
 * per_visit cadence: one invoice per job (idempotent on job_id).
 * monthly cadence: appends the visit as a line on the customer's current-month
 * rollup invoice (creates it if absent), idempotent per job via line marker.
 */
export async function draftInvoiceForJob(jobId: string): Promise<{ invoice_id: string | null; skipped?: string }> {
  const db = supabaseAdmin();
  const cfg = await getBillingConfig();

  const { data: job } = await db
    .from("jobs")
    .select("id, customer_id, price, scheduled_date, status, services(name)")
    .eq("id", jobId)
    .single();
  if (!job) return { invoice_id: null, skipped: "job_not_found" };
  if (!job.customer_id) return { invoice_id: null, skipped: "no_customer" };
  if (job.status !== "completed") return { invoice_id: null, skipped: "not_completed" };

  const price = Number(job.price ?? 0);
  if (price <= 0) return { invoice_id: null, skipped: "zero_price" };
  const svcName = (job as any).services?.name ?? "Service visit";
  const line = { service: svcName, date: job.scheduled_date, qty: 1, price, job_id: job.id };

  if (cfg.cadence === "monthly") {
    const month = String(job.scheduled_date).slice(0, 7);
    let { data: rollup } = await db
      .from("invoices")
      .select("id, line_items, subtotal")
      .eq("customer_id", job.customer_id)
      .eq("source_month", month)
      .in("status", ["draft"])
      .maybeSingle();
    if (rollup) {
      const lines = [(rollup.line_items ?? []), line].flat() as any[];
      if (lines.filter((l) => l.job_id === job.id).length > 1) return { invoice_id: rollup.id, skipped: "already_on_rollup" };
      const subtotal = lines.reduce((s, l) => s + Number(l.price), 0);
      const tax = Math.round(subtotal * cfg.tax_rate * 100) / 100;
      await db.from("invoices").update({ line_items: lines, subtotal, tax, total: subtotal + tax }).eq("id", rollup.id);
      await logAutomation({ trigger: "invoice.rollup_append", ref_id: rollup.id, detail: { job_id: job.id } });
      return { invoice_id: rollup.id };
    }
    const tax = Math.round(price * cfg.tax_rate * 100) / 100;
    const { data: created } = await db
      .from("invoices")
      .insert({
        customer_id: job.customer_id, job_id: null, source_month: month,
        line_items: [line], subtotal: price, tax, total: price + tax,
        status: "draft",
        due_date: new Date(Date.now() + cfg.net_days * 86400_000).toISOString().slice(0, 10),
      })
      .select("id").single();
    await logAutomation({ trigger: "invoice.drafted", ref_id: created?.id, detail: { cadence: "monthly", month } });
    return { invoice_id: created?.id ?? null };
  }

  // per_visit (default) — idempotent on job_id
  const { data: existing } = await db.from("invoices").select("id").eq("job_id", job.id).maybeSingle();
  if (existing) return { invoice_id: existing.id, skipped: "already_invoiced" };

  const tax = Math.round(price * cfg.tax_rate * 100) / 100;
  const { data: created, error } = await db
    .from("invoices")
    .insert({
      customer_id: job.customer_id, job_id: job.id,
      line_items: [line], subtotal: price, tax, total: price + tax,
      status: "draft",
      due_date: new Date(Date.now() + cfg.net_days * 86400_000).toISOString().slice(0, 10),
    })
    .select("id, number").single();
  if (error) {
    await logAutomation({ trigger: "invoice.drafted", status: "error", error: error.message, detail: { job_id: job.id } });
    return { invoice_id: null, skipped: error.message };
  }
  await logAutomation({ trigger: "invoice.drafted", ref_id: created.id, detail: { job_id: job.id, number: created.number, total: price + tax } });
  return { invoice_id: created.id };
}
