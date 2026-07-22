import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/** Job updates from the dispatch board — capacity-checked server-side. */
export async function POST(req: NextRequest) {
  // staff session (browser) OR internal CRON_SECRET (system automations, e.g. weather push-day)
  const internal = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const staff = internal ? { full_name: "system" } : await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body.action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.patch?.crew_id !== undefined) patch.crew_id = body.patch.crew_id;
    if (body.patch?.scheduled_date) {
      const { data: job } = await db.from("jobs").select("crew_id").eq("id", body.job_id).single();
      const crewId = (body.patch.crew_id as number) ?? job?.crew_id;
      if (crewId) {
        const { data: crew } = await db.from("crews").select("max_daily_jobs").eq("id", crewId).single();
        const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("crew_id", crewId).eq("scheduled_date", body.patch.scheduled_date).neq("status", "cancelled");
        if ((count ?? 0) >= (crew?.max_daily_jobs ?? 12)) {
          return NextResponse.json({ error: "day_full" }, { status: 409 });
        }
      }
      patch.scheduled_date = body.patch.scheduled_date;
      patch.weather_flag = false;
    }
    const { error } = await db.from("jobs").update(patch).eq("id", body.job_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("job_events").insert({ job_id: body.job_id, type: "dispatch_edit", note: JSON.stringify(patch), actor: staff.full_name ?? "staff" });
    await logAutomation({ trigger: "crm.job_update", ref_id: body.job_id, detail: patch });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "push_day") {
    const zones = (body.zones as number[]) ?? [];
    const date = body.date as string;
    const nextDay = new Date(new Date(date).getTime() + 86400_000).toISOString().slice(0, 10);
    const { data: moved, error } = await db
      .from("jobs")
      .update({ scheduled_date: nextDay, weather_flag: false })
      .eq("scheduled_date", date)
      .in("zone_id", zones)
      .eq("status", "scheduled")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.push_day", detail: { zones, from: date, to: nextDay, moved: moved?.length ?? 0 } });
    return NextResponse.json({ ok: true, moved: moved?.length ?? 0 });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
