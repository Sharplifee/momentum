import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sweepStaleVisits, getTrackingConfig } from "@/lib/tracking";

export const runtime = "nodejs";

/** End-of-day backstop: close dangling visits and prune old pings. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const swept = await sweepStaleVisits();
  const db = supabaseAdmin();
  const cfg = await getTrackingConfig(db);
  const cutoff = new Date(Date.now() - cfg.retain_ping_days * 86400_000).toISOString();
  await db.from("location_pings").delete().lt("recorded_at", cutoff);
  return NextResponse.json({ ok: true, ...swept });
}
