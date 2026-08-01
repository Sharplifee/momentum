import crypto from "crypto";

/**
 * Stripe adapter (Phase 4 §1.1). Two modes, identical shape:
 * - LIVE: STRIPE_SECRET_KEY present → real Stripe API (raw fetch, no SDK dep).
 * - PENDING: no key → placeholder checkout URLs + local-HMAC webhook secret.
 * Callers never branch — swapping in the real key changes behavior, not code.
 */

export function stripeMode(): "live" | "pending" {
  return process.env.STRIPE_SECRET_KEY ? "live" : "pending";
}

/** Webhook signing secret: real whsec_ in live mode, CRON_SECRET-derived local secret in pending mode. */
export function webhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET ?? `whsec_pending_${process.env.CRON_SECRET}`;
}

async function stripeApi(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `stripe ${path} failed`);
  return json;
}

export async function ensureStripeCustomer(customer: { id: string; full_name: string; phone: string; email?: string | null; stripe_customer_id?: string | null }): Promise<string | null> {
  if (stripeMode() === "pending") return null;
  if (customer.stripe_customer_id) return customer.stripe_customer_id;
  const created = await stripeApi("customers", {
    name: customer.full_name,
    phone: customer.phone,
    ...(customer.email ? { email: customer.email } : {}),
    "metadata[momentum_customer_id]": customer.id,
  });
  return created.id;
}

export async function createCheckoutSession(input: {
  invoice_id: string;
  display_number: string;
  amount_cents: number;
  customer_email?: string | null;
  customer_phone: string;
  stripe_customer_id?: string | null;
  base_url: string;
}): Promise<{ url: string; session_id: string | null; mode: "live" | "pending" }> {
  if (stripeMode() === "pending") {
    return {
      url: `${input.base_url}/portal/billing?pay=pending&invoice=${input.invoice_id}`,
      session_id: null,
      mode: "pending",
    };
  }
  const session = await stripeApi("checkout/sessions", {
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `Momentum Landscaping — Invoice ${input.display_number}`,
    "line_items[0][price_data][unit_amount]": String(input.amount_cents),
    "line_items[0][quantity]": "1",
    success_url: `${input.base_url}/portal/billing?paid=1`,
    cancel_url: `${input.base_url}/portal/billing?canceled=1`,
    "metadata[invoice_id]": input.invoice_id,
    ...(input.stripe_customer_id ? { customer: input.stripe_customer_id } : {}),
    ...(input.customer_email && !input.stripe_customer_id ? { customer_email: input.customer_email } : {}),
    "payment_intent_data[metadata][invoice_id]": input.invoice_id,
  });
  return { url: session.url, session_id: session.id, mode: "live" };
}

/** Verify a Stripe-style signature header (t=...,v1=...). Same scheme both modes. */
export function verifyStripeSignature(rawBody: string, sigHeader: string | null, tolerance = 300): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > tolerance && process.env.NODE_ENV === "production" && stripeMode() === "live") return false;
  const secret = webhookSecret();
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Test helper (Flow Tester): produce a signed header for a simulated payload. */
export function signTestPayload(rawBody: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", webhookSecret()).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}
