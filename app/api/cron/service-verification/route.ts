import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/**
 * End-of-day safety net.
 *
 * GPS is the primary record. When it fails — phone off, app closed, signal lost,
 * accuracy discarded — the day would otherwise end with a scheduled visit and no
 * outcome. Wayne checks the calendar himself and asks the crew who were assigned.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  // Today's scheduled work that has no outcome at all.
  const { data: jobs } = await db
    .from("jobs")
    .select("id, status, crew_id, scheduled_date, properties(address), customers(full_name), crews(name, phone, lead_profile)")
    .eq("scheduled_date", todayIso)
    .neq("status", "cancelled");

  const unresolved = ((jobs ?? []) as any[]).filter((j) => !["completed", "exception"].includes(j.status));
  if (!unresolved.length) {
    await logAutomation({ trigger: "verification.eod_all_clear", detail: { date: todayIso } });
    return NextResponse.json({ ok: true, unresolved: 0 });
  }

  // Group by crew so each person gets one message about their own stops.
  const byCrew = new Map<string, { name: string; phone: string | null; jobs: any[] }>();
  for (const j of unresolved) {
    const key = j.crew_id ?? "unassigned";
    if (!byCrew.has(key)) byCrew.set(key, { name: j.crews?.name ?? "Crew", phone: j.crews?.phone ?? null, jobs: [] });
    byCrew.get(key)!.jobs.push(j);
  }

  const sent: string[] = [];
  for (const [crewId, group] of byCrew) {
    const list = group.jobs
      .map((j) => `• ${j.customers?.full_name ?? "Client"} — ${j.properties?.address ?? "address on file"}`)
      .join("\n");
    const message =
      group.jobs.length === 1
        ? `Hey — closing out the books for today and I don't have a record for this one:\n${list}\nDid it get done? Just reply yes or no.`
        : `Hey — closing out today's books and these don't have a record yet:\n${list}\nWhich ones got done? Reply with the names, or "all" if you finished them.`;

    if (group.phone) {
      await sendSms({ to: group.phone, message, sender: "wayne" });
      sent.push(group.name);
    }

    await db.from("verification_requests").insert({
      crew_id: crewId === "unassigned" ? null : crewId,
      job_ids: group.jobs.map((j) => j.id),
      asked_at: new Date().toISOString(),
      status: group.phone ? "sent" : "no_phone",
      service_date: todayIso,
    });
  }

  // Owner summary so nothing silently rots.
  await sendSms({
    to: "+13853076535",
    message: `End of day: ${unresolved.length} visit${unresolved.length > 1 ? "s" : ""} on ${todayIso} had no GPS record. Wayne asked ${sent.length ? sent.join(", ") : "nobody — no crew phone on file"}.`,
    sender: "system",
  });

  await logAutomation({ trigger: "verification.eod_followup", detail: { unresolved: unresolved.length, crews: sent } });
  return NextResponse.json({ ok: true, unresolved: unresolved.length, asked: sent });
}
