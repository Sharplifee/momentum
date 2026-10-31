import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { sendMetaCapiEvent } from "@/lib/meta";
import { getBillingConfig, displayNumber } from "@/lib/invoices";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

async function __POST(req: NextRequest) {
  const staff = await staffFromSession(["owner"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { action, method, note, reason } = body;
  let invoice_id: string | undefined = body.invoice_id;
  const db = supabaseAdmin();
  const cfg = await getBillingConfig();

  // "+ Invoice": extras and one-offs. Visits invoice themselves on completion
  // (lib/invoices.draftInvoiceForJob); this is the hand-written one. Same
  // tax rule, same numbering, and `send` then runs the exact existing flow.
  if (action === "create") {
    const customerId = String(body.customer_id ?? "");
    const lines = ((body.line_items ?? []) as any[])
      .map((l) => ({ service: String(l.service ?? "").trim(), qty: 1, price: Math.round(Number(l.price) * 100) / 100, date: l.date ?? null, job_id: l.job_id ?? null }))
      .filter((l) => l.service && Number.isFinite(l.price) && l.price > 0);
    if (!customerId) return NextResponse.json({ error: "Pick a customer." }, { status: 400 });
    if (!lines.length) return NextResponse.json({ error: "Add at least one line with a price." }, { status: 400 });
    const { data: cust0 } = await db.from("customers").select("id").eq("id", customerId).maybeSingle();
    if (!cust0) return NextResponse.json({ error: "customer not found" }, { status: 404 });
    const dueDays = Number.isFinite(Number(body.due_days)) ? Math.max(0, Number(body.due_days)) : cfg.net_days;
    const subtotal = Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100;
    const tax = Math.round(subtotal * cfg.tax_rate * 100) / 100;
    const jobId = body.job_id ? String(body.job_id) : null;
    const { data: created, error } = await db.from("invoices").insert({
      customer_id: customerId, job_id: jobId, line_items: lines, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100,
      status: "draft", due_date: new Date(Date.now() + dueDays * 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Denver" }),
    }).select("id, number").single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 400 });
    await logAutomation({ trigger: "invoice.created_manual", ref_id: created.id, detail: { by: staff.full_name, number: created.number, subtotal, tax, lines: lines.length, due_days: dueDays } });
    if (!body.send) return NextResponse.json({ ok: true, invoice_id: created.id, number: created.number, message: "Draft saved." });
    invoice_id = created.id; // fall through to the send flow below
  }

  const { data: invoice } = await db
    .from("invoices")
    .select("id, number, total, status, customer_id, customers(id, full_name, phone, email, lifetime_value)")
    .eq("id", invoice_id).single();
  if (!invoice) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  const cust = (invoice as any).customers;

  if (action === "send" || action === "create") {
    if (invoice.status === "paid" || invoice.status === "void") return NextResponse.json({ error: `invoice is ${invoice.status}` }, { status: 409 });
    if (!cust?.phone) return NextResponse.json({ error: "No mobile number on file to text." }, { status: 400 });
    const base = process.env.APP_BASE_URL || `https://${req.headers.get("host")}`;
    const co = await fetch(`${base}/api/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ invoice_id }),
    }).then((r) => r.json());
    const payUrl = co.url ?? `${base}/portal/billing`;
    const sms = await sendSms({
      to: cust.phone,
      message: `Momentum Landscaping invoice ${displayNumber(cfg.invoice_prefix, invoice.number)}: $${Number(invoice.total).toFixed(2)}. Pay online: ${payUrl} — or reply with questions.`,
      sender: "system", template: "invoice_link",
    });
    const queued = (sms as any).reason === "queued_quiet_hours";
    await db.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", invoice_id);
    await logAutomation({ trigger: "invoice.sent", ref_id: invoice_id, detail: { by: staff.full_name, mode: co.mode, texted: sms.ok, queued } });
    return NextResponse.json({ ok: true, invoice_id, texted: sms.ok, queued, message: sms.ok ? `Sent (${co.mode ?? "?"} mode).` : queued ? "Queued for 8:00 AM — quiet hours." : "Marked sent, but the text did not go through." });
  }

  if (action === "mark_paid") {
    if (invoice.status === "paid") return NextResponse.json({ error: "already paid" }, { status: 409 });
    const amount = Number(invoice.total);
    const { data: payment } = await db.from("payments").insert({
      invoice_id, amount, method: method ?? "cash", note: note || null, paid_at: new Date().toISOString(),
    }).select("id").single();
    await db.from("invoices").update({ status: "paid" }).eq("id", invoice_id);
    if (cust) await db.from("customers").update({ lifetime_value: Number(cust.lifetime_value ?? 0) + amount }).eq("id", cust.id);
    await db.from("audit_log").insert({ actor: staff.full_name ?? "owner", action: "mark_paid", table_name: "invoices", row_id: invoice_id, detail: { method, note, amount } });
    // Meta Purchase with same dedupe rule as the webhook
    const { data: lead } = await db.from("leads").select("id").eq("customer_id", cust?.id ?? "").limit(1).maybeSingle();
    const { data: prior } = lead ? await db.from("meta_events").select("id").eq("event_name", "Purchase").eq("lead_id", lead.id).maybeSingle() : { data: null };
    if (!prior && cust) {
      await sendMetaCapiEvent({ event_name: "Purchase", event_id: `pay_${payment?.id}`, phone: cust.phone, email: cust.email, lead_id: lead?.id ?? null, action_source: "system_generated", value: amount });
    }
    await logAutomation({ trigger: "invoice.mark_paid", ref_id: invoice_id, detail: { method, amount, by: staff.full_name } });
    return NextResponse.json({ ok: true, message: "Marked paid." });
  }

  if (action === "void") {
    await db.from("invoices").update({ status: "void", void_reason: reason ?? null }).eq("id", invoice_id);
    await db.from("audit_log").insert({ actor: staff.full_name ?? "owner", action: "void_invoice", table_name: "invoices", row_id: invoice_id, detail: { reason } });
    await logAutomation({ trigger: "invoice.void", ref_id: invoice_id, detail: { reason, by: staff.full_name } });
    return NextResponse.json({ ok: true, message: "Voided." });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export const POST = withEventLog("POST /api/crm/money", __POST);
