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
  if (!job_id || !["arrived", "departed", "exception"].includes(event)) {
    return NextResponse.json({ error: "job_id and event (arrived|departed|exception) required" }, { status: 400 });
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
  } else {
    await db.from("jobs").update({ status: "exception" }).eq("id", job_id);
    await db.from("exceptions").insert({
      job_id,
      type: "crew_reported",
      detail: note ?? null,
      wayne_summary: note ? `Crew reported: ${note}` : "Crew flagged an exception.",
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
