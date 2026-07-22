import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms, renderTemplate } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 18:00 MT: day-before reminders to customers (template reminder_day_before). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const tomorrow = new Date(Date.now() + 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  const { data: jobs } = await db
    .from("jobs")
    .select("id, window_start, window_end, customers(id, full_name, phone, sms_opt_out, reminder_opt_out), properties(address)")
    .eq("scheduled_date", tomorrow)
    .eq("status", "scheduled");

  const { data: tpl } = await db.from("sms_templates").select("body").eq("name", "reminder_day_before").single();
  let sent = 0;

  for (const job of (jobs ?? []) as any[]) {
    const c = job.customers;
    if (!c?.phone) continue;
    if (c.sms_opt_out || c.reminder_opt_out) {
      await logAutomation({ trigger: "cron.reminders.suppressed", ref_id: job.id, status: "skipped", detail: { customer: c.id, reason: c.sms_opt_out ? "sms_opt_out" : "reminder_opt_out" } });
      continue;
    }
    // idempotence: one reminder per job
    const { data: already } = await db.from("job_events").select("id").eq("job_id", job.id).eq("type", "reminder_sent").maybeSingle();
    if (already) continue;
    const windowTxt = job.window_start ? `${job.window_start.slice(0, 5)}–${job.window_end?.slice(0, 5) ?? ""}` : "during the day";
    const msg = tpl
      ? renderTemplate(tpl.body, { window: windowTxt, address: job.properties?.address ?? "your property" })
      : `Reminder: Momentum crew comes tomorrow at ${job.properties?.address}.`;
    const r = await sendSms({ to: c.phone, message: msg, sender: "system" });
    if (r.ok || (r as any).scheduled_id) {
      await db.from("job_events").insert({ job_id: job.id, type: "reminder_sent", actor: "system" });
      sent++;
    }
  }

  await logAutomation({ trigger: "cron.reminders", detail: { date: tomorrow, sent } });
  return NextResponse.json({ ok: true, sent });
}
