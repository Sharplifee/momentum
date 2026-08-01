import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Ping retention only.
 *
 * Visit closing is owned by momentum_tracking_sweep() on pg_cron every 5 minutes,
 * which tests against the surveyed parcel polygon. This route no longer sweeps
 * visits — two engines writing the same tables corrupts visit state.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: cfg } = await db.from("system_config").select("value").eq("key", "tracking").single();
  const retainDays = Number((cfg?.value as any)?.retain_ping_days ?? 30);
  const cutoff = new Date(Date.now() - retainDays * 86400_000).toISOString();
  const { count } = await db
    .from("location_pings")
    .delete({ count: "exact" })
    .lt("recorded_at", cutoff);
  return NextResponse.json({ ok: true, pruned: count ?? 0, retain_days: retainDays });
}
