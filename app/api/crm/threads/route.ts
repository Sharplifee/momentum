import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { thread_id, escalated } = await req.json().catch(() => ({}));
  if (!thread_id) return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  const db = supabaseAdmin();
  await db.from("threads").update({ escalated: Boolean(escalated) }).eq("id", thread_id);
  await logAutomation({ trigger: "crm.thread_takeover", ref_id: thread_id, detail: { escalated, by: staff.full_name } });
  return NextResponse.json({ ok: true });
}
