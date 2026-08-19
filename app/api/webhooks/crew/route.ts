import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/** Crew status webhook: arrived / departed / exception (3.7). CRON_SECRET-gated (Today view calls it server-side). */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const { job_id, event, note, actor } = body ?? {};
  const CREW_EVENTS = ["arrived", "departed", "exception", "yard_not_ready", "access_blocked"];
  if (!job_id || !CREW_EVENTS.includes(event)) {
    return NextResponse.json({ error: `job_id and event (${CREW_EVENTS.join("|")}) required` }, { status: 400 });
  }
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  if (event === "arrived") {
    await db.from("jobs").update({ arrival_at: now, status: "in_progress" }).eq("id", job_id);
  } else if (event === "departed") {
    await db.from("jobs").update({ departure_at: now, status: "completed" }).eq("id", job_id);
    // A9 extension: completed job → auto-draft invoice
    const { draftInvoiceForJob } = await import("@/lib/invoices");
    await draftInvoiceForJob(job_id);
  } else if (event === "yard_not_ready" || event === "access_blocked") {
    // job_events row below feeds momentum_service_monitor's yard_not_ready/access_blocked
    // checks, which raise the exception (and, for repeated readiness failures, escalate to
    // price review) — kept centralized there rather than duplicated here.
    await db.from("jobs").update({ status: "exception" }).eq("id", job_id);
    await sendSms({
      to: "+13853076535",
      message: `⚠️ ${event === "access_blocked" ? "Access blocked" : "Yard not ready"} (${job_id.slice(0, 8)}…): ${note ?? "no detail"}`,
      sender: "system",
      bypassQuietHours: true,
    });
  } else {
    await db.from("jobs").update({ status: "exception" }).eq("id", job_id);
    await db.from("exceptions").insert({
      job_id,
      type: "crew_reported",
      detail: note ?? null,
      nora_summary: note ? `Crew reported: ${note}` : "Crew flagged an exception.",
    });
    await sendSms({
      to: "+13853076535",
      message: `⚠️ Job exception (${job_id.slice(0, 8)}…): ${note ?? "no detail"}`,
      sender: "system",
      bypassQuietHours: true,
    });
  }

  await db.from("job_events").insert({ job_id, type: event, note: note ?? null, actor: actor ?? "crew" });
  await logAutomation({ trigger: `webhook.crew.${event}`, ref_id: job_id, detail: { note } });
  return NextResponse.json({ ok: true });
}
