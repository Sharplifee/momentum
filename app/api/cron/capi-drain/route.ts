import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMetaCapiEvent } from "@/lib/meta";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Drains meta_event_queue to Meta's Conversions API.
 *
 * The queue exists for conversions that happen with no browser attached —
 * today that is Purchase, fired by a trigger when a lead reaches closed_won,
 * which is the offline signal the ad account is optimised against. Lead is
 * sent inline by /api/leads and is deliberately not queued.
 *
 * This replaces the never-deployed `capi-dispatcher` edge function: the sender,
 * the hashing and the credentials already live in lib/meta.ts, so a second
 * implementation behind a separate vault key was two things to keep in sync.
 *
 * Failures back off exponentially and retire after max_attempts, so a bad row
 * cannot hold the queue.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();

  const { data: cfgRow } = await db
    .from("system_config")
    .select("value")
    .eq("key", "meta_capi")
    .maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as Record<string, unknown>;
  if (cfg.enabled === false) {
    return NextResponse.json({ ok: true, skipped: "meta_capi disabled" });
  }
  const batchSize = Number(cfg.batch_size ?? 25);
  const weeklyDefault = Number(cfg.default_weekly ?? 45);
  const annualWeeks = Number(cfg.annual_weeks ?? 28);

  const { data: due } = await db
    .from("meta_event_queue")
    .select("id, event_id, event_name, lead_id, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("id")
    .limit(batchSize);

  if (!due?.length) return NextResponse.json({ ok: true, sent: 0, due: 0 });

  const leadIds = [...new Set(due.map((d) => d.lead_id).filter(Boolean))] as string[];
  const { data: leads } = leadIds.length
    ? await db
        .from("leads")
        .select(
          "id, email, phone, fbp, fbc, fbclid, client_ip, user_agent, external_id, landing_page, annual_value, quote_amount"
        )
        .in("id", leadIds)
    : { data: [] as any[] };
  const leadById = new Map((leads ?? []).map((l: any) => [l.id, l]));

  let sent = 0;
  const failures: { id: number; reason: string }[] = [];

  for (const row of due) {
    const lead = row.lead_id ? leadById.get(row.lead_id) : null;
    if (!lead) {
      await db
        .from("meta_event_queue")
        .update({ status: "dead", last_error: "lead row missing" })
        .eq("id", row.id);
      continue;
    }

    // A closed lead's value is its annual worth: the accepted quote if we have
    // one, otherwise the standing weekly price across a Utah mowing season.
    const value =
      Number(lead.annual_value) ||
      Number(lead.quote_amount) * annualWeeks ||
      weeklyDefault * annualWeeks;

    const { ok, response } = await sendMetaCapiEvent({
      event_name: row.event_name as "Purchase" | "Lead" | "Schedule" | "InitiateCheckout",
      event_id: row.event_id,
      email: lead.email,
      phone: lead.phone,
      fbp: lead.fbp,
      fbc: lead.fbc,
      fbclid: lead.fbclid,
      external_id: lead.external_id ?? lead.id,
      client_ip: lead.client_ip ?? undefined,
      client_user_agent: lead.user_agent ?? undefined,
      event_source_url: lead.landing_page ?? undefined,
      // No browser is present when a deal closes in the CRM.
      action_source: "system_generated",
      value,
      currency: "USD",
      lead_id: lead.id,
    });

    if (ok) {
      await db
        .from("meta_event_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
    } else {
      const attempts = (row.attempts ?? 0) + 1;
      const exhausted = attempts >= (row.max_attempts ?? 6);
      // 2^n minutes: 2, 4, 8, 16, 32, 64 — enough to ride out a Meta blip.
      const backoffMs = Math.pow(2, attempts) * 60_000;
      const reason = JSON.stringify(response).slice(0, 500);
      await db
        .from("meta_event_queue")
        .update({
          attempts,
          status: exhausted ? "dead" : "pending",
          next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
          last_error: reason,
        })
        .eq("id", row.id);
      failures.push({ id: row.id, reason });
    }
  }

  await logAutomation({
    trigger: "cron.capi_drain",
    detail: { due: due.length, sent, failed: failures.length },
    status: failures.length ? "error" : undefined,
    error: failures[0]?.reason,
  });

  return NextResponse.json({
    ok: true,
    due: due.length,
    sent,
    failed: failures.length,
    errors: failures.slice(0, 3).map((f) => f.reason),
  });
}
