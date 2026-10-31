import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/** Resolve a service exception raised by the GPS verification engine. */
async function __POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, action, job_id, note } = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  // "Flag this visit" from the visit record: a manager-raised exception on a finished job.
  if (action === "flag") {
    if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });
    const { data: job } = await db.from("jobs").select("id, crew_id, scheduled_date").eq("id", job_id).single();
    if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data: ex, error } = await db.from("exceptions").insert({
      job_id, type: "flagged", severity: "high", detail: note?.trim() || "Flagged for review by the office.",
      crew_id: job.crew_id, occurred_on: job.scheduled_date, resolved: false,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("job_events").insert({ job_id, type: "flagged", note: note?.trim() || null, actor: staff.full_name ?? "staff" });
    return NextResponse.json({ ok: true, id: ex?.id });
  }

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (action === "reopen") {
    const { error } = await db.from("exceptions").update({ resolved: false, resolved_at: null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await db
    .from("exceptions")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export const POST = withEventLog("POST /api/crm/exceptions", __POST);
