import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Post-service proof-of-service SMS. service_proofs.statement already reads in
 * plain English ("GPS-verified service at {address}..."); this just delivers it.
 * Runs every 15 min scanning unsent proofs rather than firing per-insert, so a
 * burst of crew departures doesn't fan out concurrent sends.
 *
 * OFF by default — system_config.tracking.proof_sms_enabled must be set true.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: cfg } = await db.from("system_config").select("value").eq("key", "tracking").single();
  const enabled = Boolean((cfg?.value as any)?.proof_sms_enabled);

  const { data: proofs } = await db
    .from("service_proofs")
    .select("id, statement, customers(id, full_name, phone, sms_opt_out)")
    .is("sms_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  let sent = 0, skipped = 0;
  for (const p of (proofs ?? []) as any[]) {
    const c = p.customers;
    if (!c?.phone) { skipped++; continue; }
    if (!enabled) { skipped++; continue; }
    const r = await sendSms({ to: c.phone, message: `${p.statement} 🌱 — Momentum Landscaping`, sender: "system" });
    if (r.ok) {
      await db.from("service_proofs").update({ sms_sent_at: new Date().toISOString() }).eq("id", p.id);
      sent++;
    }
  }

  await logAutomation({ trigger: "cron.proof-sms", detail: { enabled, sent, skipped, total: (proofs ?? []).length } });
  return NextResponse.json({ ok: true, enabled, sent, skipped });
}
