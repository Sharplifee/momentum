import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { kind, payload } = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (kind === "service_price") await db.from("services").update({ base_price: payload.base_price }).eq("id", payload.id);
  else if (kind === "service_active") await db.from("services").update({ active: payload.active }).eq("id", payload.id);
  else if (kind === "template") await db.from("sms_templates").update({ body: payload.body }).eq("id", payload.id);
  else if (kind === "alerts_mode") {
    const { data: cfg } = await db.from("system_config").select("value").eq("key", "team_alerts").single();
    await db.from("system_config").update({ value: { ...(cfg?.value as object), mode: payload.mode }, updated_at: new Date().toISOString() }).eq("key", "team_alerts");
  }
  // NOTE: sms_sandbox has NO write path here on purpose — Connor's explicit word required.
  else return NextResponse.json({ error: "unknown kind" }, { status: 400 });

  await logAutomation({ trigger: "crm.settings", detail: { kind, payload, by: staff.full_name } });
  return NextResponse.json({ ok: true });
}
