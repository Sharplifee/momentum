import { NextRequest, NextResponse } from "next/server";
import { withEventLog } from "@/lib/eventLog";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function __POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  // SMS status (Pingram cap proxy via launch_checklist and sandbox counters when available)
  const { data: cfgRows } = await db.from("system_config").select("key, value").in("key", ["launch_checklist", "sms_sandbox"]);
  const checklist = (cfgRows ?? []).find((r) => r.key === "launch_checklist")?.value as any;
  const sandbox = (cfgRows ?? []).find((r) => r.key === "sms_sandbox")?.value as any;
  const smsOutboundOpen = Boolean((checklist?.items ?? []).find((i: any) => i.id === "sms_outbound" && !i.done));
  const smsDetail: any = {
    plan: "Pingram",
    sandbox: Boolean(sandbox?.enabled) || undefined,
    spend: sandbox?.sends_used ?? undefined,
    cap: sandbox?.max_build_sends ?? undefined,
    note: smsOutboundOpen ? "Provider reports budget cap" : undefined,
  };
  await db.from("system_status").upsert({ key: "sms", ok: !smsOutboundOpen, detail: smsDetail, checked_at: now });

  // Norma reachability (credits + last automation run sample)
  const creditsOpen = Boolean((checklist?.items ?? []).find((i: any) => i.id === "anthropic_credits" && !i.done));
  const { data: lastRun } = await db.from("automation_runs").select("created_at").ilike("trigger", "nora.%").order("created_at", { ascending: false }).limit(1);
  await db.from("system_status").upsert({
    key: "norma",
    ok: !creditsOpen,
    detail: { last_seen: lastRun?.[0]?.created_at ?? null, credits_ok: !creditsOpen },
    checked_at: now,
  });

  // GPS devices and parcels
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: recentDevices }, { count: totalDevices }] = await Promise.all([
    db.from("tracked_devices").select("id", { count: "exact", head: true }).gte("last_seen_at", dayAgo),
    db.from("tracked_devices").select("id", { count: "exact", head: true }),
  ]);
  const [{ count: parcelsMatched }, { count: propertiesTotal }] = await Promise.all([
    db.from("properties").select("id", { count: "exact", head: true }).not("parcel_ring", "is", null),
    db.from("properties").select("id", { count: "exact", head: true }),
  ]);
  await db.from("system_status").upsert({
    key: "gps",
    ok: (recentDevices ?? 0) > 0,
    detail: { devices_reporting_24h: recentDevices ?? 0, devices_total: totalDevices ?? 0, parcels_matched: parcelsMatched ?? 0, parcels_total: propertiesTotal ?? 0 },
    checked_at: now,
  });

  // Data hygiene: customers without real phones; messages without thread
  const [{ count: noPhone }, { count: orphanMsgs }] = await Promise.all([
    db.from("customers").select("id", { count: "exact", head: true }).or("phone.is.null,phone.like.unknown:%"),
    db.from("messages").select("id", { count: "exact", head: true }).is("thread_id", null),
  ]);
  await db.from("system_status").upsert({
    key: "data",
    ok: (noPhone ?? 0) === 0 && (orphanMsgs ?? 0) === 0,
    detail: { customers_missing_phone: noPhone ?? 0, messages_without_thread: orphanMsgs ?? 0 },
    checked_at: now,
  });

  return NextResponse.json({ ok: true, at: now });
}

export const POST = withEventLog("POST /api/cron/status", __POST);
