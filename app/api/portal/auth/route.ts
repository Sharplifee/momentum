import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { corsHeaders, withCors } from "@/lib/portalCors";

export const runtime = "nodejs";

/**
 * Customer sign-in by phone.
 *
 * Customers are reached by text, not email — of thirty on the books, one has an
 * email address and all of them have a phone. Asking for a password they never
 * set would strand every one of them, so the number they already give us is the
 * identity, and a six-digit code proves it.
 *
 * POST { phone }        -> sends a code
 * POST { phone, code }  -> returns a session
 */

const norm = (p: string) => {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return p.startsWith("+") ? p : `+${d}`;
};

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const { phone, code } = await req.json().catch(() => ({}));
  if (!phone) return withCors({ error: "phone required" }, origin, 400);

  const e164 = norm(phone);
  const db = supabaseAdmin();

  const { data: customer } = await db
    .from("customers")
    .select("id, full_name, phone, status")
    .eq("phone", e164)
    .maybeSingle();

  // Never confirm or deny whether a number is on the books. An attacker should
  // not be able to use this endpoint to discover who is a customer.
  if (!code) {
    if (customer) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await db.from("portal_codes").insert({
        phone: e164,
        code: otp,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      await fetch("https://api.pingram.dev/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PINGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.PINGRAM_FROM_NUMBER,
          to: e164,
          text: `${otp} is your Momentum sign-in code. It expires in 10 minutes.`,
        }),
      }).catch(() => null);
    }
    return withCors({ sent: true }, origin);
  }

  const { data: row } = await db
    .from("portal_codes")
    .select("id, code, expires_at, used_at")
    .eq("phone", e164)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || row.code !== String(code).trim() || !customer) {
    return withCors({ error: "That code didn't work. Try again or request a new one." }, origin, 401);
  }

  await db.from("portal_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

  const { data: session } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: `${e164.replace("+", "")}@phone.momentumlandscapingut.com`,
  });

  return withCors({
    ok: true,
    customer: { id: customer.id, name: customer.full_name },
    token: (session as any)?.properties?.hashed_token ?? null,
  }, origin);
}
