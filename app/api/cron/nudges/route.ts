import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms, renderTemplate } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Hourly 8a–8p (vercel.json). Finds lead threads where the last message is
 * ours and the lead hasn't replied, and sends nudge_1h / nudge_24h / nudge_72h
 * exactly once each. After the 72h nudge, the lead goes stage → stale.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = Date.now();

  const { data: leads } = await db
    .from("leads")
    .select("id, full_name, phone, address, requested_window, stage, created_at, source")
    .in("stage", ["new", "contacted"])
    .neq("source", "test")
    .gte("created_at", new Date(now - 7 * 24 * 3600_000).toISOString());

  const results: Record<string, string> = {};

  for (const lead of leads ?? []) {
    const ageMin = (now - new Date(lead.created_at).getTime()) / 60000;
    let templateName: string | null = null;
    if (ageMin >= 4320) templateName = "nudge_72h";
    else if (ageMin >= 1440) templateName = "nudge_24h";
    else if (ageMin >= 60) templateName = "nudge_1h";
    if (!templateName) continue;

    const { data: thread } = await db
      .from("threads")
      .select("id, escalated")
      .eq("lead_id", lead.id)
      .limit(1)
      .maybeSingle();
    if (!thread || thread.escalated) continue;

    // has the customer replied at all? if yes, no nudges
    const { count: inboundCount } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .eq("direction", "inbound");
    if ((inboundCount ?? 0) > 0) continue;

    // already sent this nudge? check lead_events
    const { data: alreadySent } = await db
      .from("lead_events")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("type", `nudge_sent_${templateName}`)
      .maybeSingle();
    if (alreadySent) continue;

    const { data: tpl } = await db
      .from("sms_templates")
      .select("body")
      .eq("name", templateName)
      .eq("active", true)
      .single();
    if (!tpl) continue;

    const message = renderTemplate(tpl.body, {
      first_name: (lead.full_name ?? "there").split(" ")[0],
      address: lead.address ?? "your place",
      window: lead.requested_window ?? "your requested time",
    });

    const sent = await sendSms({ to: lead.phone, message, thread_id: thread.id, sender: "nora" });
    if (sent.ok) {
      await db.from("lead_events").insert({
        lead_id: lead.id,
        type: `nudge_sent_${templateName}`,
        actor: "system",
      });
      if (templateName === "nudge_72h") {
        await db.from("leads").update({ stage: "stale" }).eq("id", lead.id);
      }
      results[lead.id] = templateName;
    }
  }

  await logAutomation({ trigger: "cron.nudges", detail: { sent: results } });
  return NextResponse.json({ ok: true, sent: results });
}
