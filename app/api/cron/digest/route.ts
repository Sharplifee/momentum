import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 20:00 MT: owner digest SMS (email lands when Resend does). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const dayStartLocal = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const dayStartUtc = new Date(`${dayStartLocal}T06:00:00Z`).toISOString(); // ~midnight MT

  const [leadsIn, booked, completed, exceptions, respAgg] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).gte("created_at", dayStartUtc).neq("source", "test"),
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", dayStartUtc),
    db.from("jobs").select("price").eq("status", "completed").gte("departure_at", dayStartUtc),
    db.from("exceptions").select("id", { count: "exact", head: true }).gte("created_at", dayStartUtc).eq("resolved", false),
    db.from("leads").select("response_time_seconds").gte("created_at", dayStartUtc).not("response_time_seconds", "is", null),
  ]);

  const revenue = (completed.data ?? []).reduce((s, j) => s + Number(j.price ?? 0), 0);
  const rts = (respAgg.data ?? []).map((l) => l.response_time_seconds as number);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length / 60) : null;

  const msg = `Momentum digest ${dayStartLocal}: ${leadsIn.count ?? 0} leads in · ${booked.count ?? 0} jobs booked · ${completed.data?.length ?? 0} completed ($${revenue.toFixed(0)}) · ${exceptions.count ?? 0} open exceptions · avg first-response ${avgResp != null ? avgResp + "m" : "n/a"}.`;
  const r = await sendSms({ to: "+13853076535", message: msg, sender: "system", bypassQuietHours: true });

  await logAutomation({ trigger: "cron.digest", status: r.ok ? "ok" : "error", detail: { msg } });
  return NextResponse.json({ ok: r.ok, digest: msg });
}
