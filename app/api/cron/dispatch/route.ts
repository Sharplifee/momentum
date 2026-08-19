import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 6:00 MT: text each crew its ordered stops for today. Sandbox routes these to Connor during build. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  const { data: crews } = await db.from("crews").select("id, name, phone").eq("active", true);
  const sent: Record<string, number> = {};

  for (const crew of crews ?? []) {
    const { data: jobs } = await db
      .from("jobs")
      .select("id, scheduled_date, window_start, price, status, weather_flag, properties(address, city, gate_code, pets), services(name), customers(full_name)")
      .eq("crew_id", crew.id)
      .eq("scheduled_date", today)
      .neq("status", "cancelled")
      .order("window_start", { ascending: true, nullsFirst: false });

    if (!jobs?.length || !crew.phone) continue;
    const lines = jobs.map((j: any, i: number) => {
      const p = j.properties;
      const extras = [p?.gate_code ? `gate ${p.gate_code}` : null, p?.pets ? `pets: ${p.pets}` : null, j.weather_flag ? "⚠️ weather" : null].filter(Boolean).join(", ");
      return `${i + 1}. ${p?.address ?? "?"}${p?.city ? ", " + p.city : ""} — ${j.services?.name ?? ""}${extras ? ` (${extras})` : ""}`;
    });
    const msg = `Momentum dispatch ${today} — ${crew.name}:\n${lines.join("\n")}\nReply to Nora with any issues.`;
    const r = await sendSms({ to: crew.phone, message: msg, sender: "system", bypassQuietHours: true });
    if (r.ok) sent[crew.name] = jobs.length;
  }

  await logAutomation({ trigger: "cron.dispatch", detail: { date: today, sent } });
  return NextResponse.json({ ok: true, sent });
}
