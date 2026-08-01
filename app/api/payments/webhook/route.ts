import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/stripe";
import { sendSms } from "@/lib/sms";
import { sendMetaCapiEvent } from "@/lib/meta";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/** Stripe webhook (signature-verified in BOTH modes — pending mode uses the local HMAC secret). */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyStripeSignature(rawBody, sig)) {
    await logAutomation({ trigger: "payments.webhook.bad_signature", status: "error" });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const db = supabaseAdmin();
  const type = event.type as string;
  const obj = event.data?.object ?? {};

  if (type === "checkout.session.completed" || type === "payment_intent.succeeded") {
    const invoiceId = obj.metadata?.invoice_id;
    if (!invoiceId) return NextResponse.json({ ok: true, ignored: "no invoice_id" });

    const { data: invoice } = await db
      .from("invoices")
      .select("id, number, total, status, customer_id, customers(id, full_name, phone, email, lifetime_value)")
      .eq("id", invoiceId)
      .single();
    if (!invoice) return NextResponse.json({ ok: true, ignored: "invoice not found" });
    if (invoice.status === "paid") return NextResponse.json({ ok: true, ignored: "already paid" }); // idempotent

    const amount = Number(invoice.total);
    const stripeId = obj.payment_intent ?? obj.id ?? null;

    const { data: payment } = await db
      .from("payments")
      .insert({ invoice_id: invoice.id, amount, method: "card", stripe_id: stripeId, paid_at: new Date().toISOString() })
      .select("id").single();
    await db.from("invoices").update({ status: "paid" }).eq("id", invoice.id);

    const cust = (invoice as any).customers;
    if (cust) {
      await db.from("customers").update({ lifetime_value: Number(cust.lifetime_value ?? 0) + amount }).eq("id", cust.id);
      // receipt: portal thread + SMS (dry-run rules apply)
      const { data: thread } = await db.from("threads").select("id").eq("phone", cust.phone).limit(1).maybeSingle();
      const receipt = `Payment received — $${amount.toFixed(2)} for invoice MOM-${invoice.number}. Thank you! 🌱`;
      if (thread) await db.from("messages").insert({ thread_id: thread.id, channel: "portal", direction: "outbound", sender: "system", body: receipt });
      await sendSms({ to: cust.phone, message: receipt, thread_id: thread?.id ?? null, sender: "system" });

      // Meta Purchase — ONLY if no Purchase already sent for this customer's closed-won lead
      const { data: lead } = await db.from("leads").select("id").eq("customer_id", cust.id).limit(1).maybeSingle();
      const { data: priorPurchase } = lead
        ? await db.from("meta_events").select("id").eq("event_name", "Purchase").eq("lead_id", lead.id).maybeSingle()
        : { data: null };
      if (!priorPurchase) {
        await sendMetaCapiEvent({
          event_name: "Purchase",
          event_id: `pay_${payment?.id}`,
          phone: cust.phone, email: cust.email,
          lead_id: lead?.id ?? null,
          action_source: "system_generated",
          value: amount,
        });
      } else {
        await logAutomation({ trigger: "payments.purchase_dedupe", ref_id: invoice.id, status: "skipped", detail: { reason: "closed_won Purchase already sent" } });
      }
    }

    await logAutomation({ trigger: "payments.paid", ref_id: invoice.id, detail: { amount, payment_id: payment?.id, via: type } });
    return NextResponse.json({ ok: true });
  }

  if (type === "payment_intent.payment_failed") {
    await logAutomation({ trigger: "payments.failed", detail: { intent: obj.id, invoice_id: obj.metadata?.invoice_id } });
    return NextResponse.json({ ok: true });
  }

  if (type === "charge.refunded") {
    const stripeId = obj.payment_intent ?? obj.id;
    const { data: payment } = await db.from("payments").select("id, invoice_id, amount").eq("stripe_id", stripeId).maybeSingle();
    if (payment) {
      await db.from("payments").insert({ invoice_id: payment.invoice_id, amount: -Number(payment.amount), method: "refund", stripe_id: `refund_${stripeId}`, paid_at: new Date().toISOString() });
      await db.from("invoices").update({ status: "refunded" as any }).eq("id", payment.invoice_id);
      await sendSms({ to: "+13853076535", message: `Refund processed on invoice ${payment.invoice_id.slice(0, 8)}… ($${payment.amount}).`, sender: "system", bypassQuietHours: true });
    }
    await logAutomation({ trigger: "payments.refunded", ref_id: payment?.invoice_id ?? null, detail: { stripe_id: stripeId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: type });
}
