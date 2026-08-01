import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveAllUnresolvedProperties } from "@/lib/parcel";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hourly self-resolve: any property still missing a verified interior-pin
 * parcel fence (new address, or a stale centroid pin) gets re-resolved with no
 * human action. Wired via pg_cron -> momentum_cron_call('/api/cron/parcel').
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const results = await resolveAllUnresolvedProperties(db);
  const resolved = results.filter((r) => r.matched).length;

  await logAutomation({
    trigger: "cron.tracking-parcel",
    detail: { total: results.length, resolved, unresolved: results.filter((r) => !r.matched).map((r) => ({ id: r.id, address: r.address })) },
  });

  return NextResponse.json({ ok: true, resolved, total: results.length });
}
