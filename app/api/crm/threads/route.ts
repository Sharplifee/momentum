import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";
import { toE164 } from "@/lib/phone";

export const runtime = "nodejs";

/**
 * Thread controls for staff.
 *  - { thread_id, escalated }        take over from Norma / hand back to her
 *  - { action: "create", phone, lead_id?, customer_id? }
 *                                     open a thread for someone who has never
 *                                     texted in, so a first text has a home
 */
async function __POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body.action === "create") {
    const phone = toE164(String(body.phone ?? ""));
    if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });
    const { data: existing } = await db.from("threads").select("id").eq("phone", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, thread_id: existing.id, existed: true });
    const { data: created, error } = await db.from("threads")
      .insert({ phone, lead_id: body.lead_id ?? null, customer_id: body.customer_id ?? null, escalated: false })
      .select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.thread_opened", ref_id: created.id, detail: { phone, lead_id: body.lead_id ?? null, by: staff.full_name } });
    return NextResponse.json({ ok: true, thread_id: created.id });
  }

  const { thread_id, escalated } = body;
  if (!thread_id) return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  await db.from("threads").update({ escalated: Boolean(escalated) }).eq("id", thread_id);
  await logAutomation({ trigger: "crm.thread_takeover", ref_id: thread_id, detail: { escalated, by: staff.full_name } });
  return NextResponse.json({ ok: true });
}

export const POST = withEventLog("POST /api/crm/threads", __POST);
