import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { sendMetaCapiEvent } from "@/lib/meta";
import { getBillingConfig, displayNumber } from "@/lib/invoices";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { action, invoice_id, method, note, reason } = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const cfg = await getBillingConfig();

  const { data: invoice } = await db
    .from("invoices")
    .select("id, number, total, status, customer_id, customers(id, full_name, phone, email, lifetime_value)")
    .eq("id", invoice_id).single();
  if (!invoice) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  const cust = (invoice as any).customers;

  if (action === "send") {
    const base = process.env.APP_BASE_URL || `https://${req.headers.get("host")}`;
    const co = await fetch(`${base}/api/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ invoice_id }),
    }).then((r) => r.json());
    const payUrl = co.url ?? `${base}/portal/billing`;
    await sendSms({
      to: cust.phone,
      message: `Momentum Landscaping invoice ${displayNumber(cfg.invoice_prefix, invoice.number)}: $${Number(invoice.total).toFixed(2)}. Pay online: ${payUrl} — or reply with questions.`,
      sender: "system",
    });
    await db.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", invoice_id);
    await logAutomation({ trigger: "invoice.sent", ref_id: invoice_id, detail: { by: staff.full_name, mode: co.mode } });
    return NextResponse.json({ ok: true, message: `Sent (${co.mode ?? "?"} mode).` });
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
