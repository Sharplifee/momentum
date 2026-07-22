import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCheckoutSession, ensureStripeCustomer, stripeMode } from "@/lib/stripe";
import { getBillingConfig, displayNumber } from "@/lib/invoices";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/** Creates a checkout URL for an invoice. Callable by the invoice's customer (portal) or staff (CRM), or internally via CRON_SECRET. */
export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();
  const internal = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  let callerCustomerId: string | null = null;
  let isStaff = false;

  if (!internal) {
    const s = supabaseServer();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    isStaff = ["owner", "manager"].includes(profile?.role ?? "");
    if (!isStaff) {
      const { data: cust } = await admin.from("customers").select("id").eq("profile_id", user.id).maybeSingle();
      callerCustomerId = cust?.id ?? null;
      if (!callerCustomerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { invoice_id } = await req.json().catch(() => ({}));
  if (!invoice_id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, number, total, status, customer_id, customers(id, full_name, phone, email, stripe_customer_id)")
    .eq("id", invoice_id)
    .single();
  if (!invoice) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  if (callerCustomerId && invoice.customer_id !== callerCustomerId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (invoice.status === "paid" || invoice.status === "void") return NextResponse.json({ error: `invoice is ${invoice.status}` }, { status: 409 });

  const cfg = await getBillingConfig();
  const cust = (invoice as any).customers;
  let stripeCustomerId: string | null = cust?.stripe_customer_id ?? null;
  if (stripeMode() === "live" && cust && !stripeCustomerId) {
    stripeCustomerId = await ensureStripeCustomer(cust);
    if (stripeCustomerId) await admin.from("customers").update({ stripe_customer_id: stripeCustomerId }).eq("id", cust.id);
  }

  const base = process.env.APP_BASE_URL || `https://${req.headers.get("host")}`;
  const session = await createCheckoutSession({
    invoice_id: invoice.id,
    display_number: displayNumber(cfg.invoice_prefix, invoice.number),
    amount_cents: Math.round(Number(invoice.total) * 100),
    customer_email: cust?.email,
    customer_phone: cust?.phone ?? "",
    stripe_customer_id: stripeCustomerId,
    base_url: base,
  });

  await logAutomation({ trigger: "payments.checkout_created", ref_id: invoice.id, detail: { mode: session.mode, session_id: session.session_id } });
  return NextResponse.json({ ok: true, url: session.url, mode: session.mode });
}
