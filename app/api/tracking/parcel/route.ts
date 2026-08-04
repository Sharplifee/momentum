import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { staffFromSession } from "@/lib/apiAuth";
import { resolveAllUnresolvedProperties } from "@/lib/parcel";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Parcel-accurate geofencing for any property.
 *
 * Queries Utah's statewide parcel layer (1.59M surveyed polygons) by address,
 * pins the interior pole of inaccessibility (guaranteed inside the lot, unlike a
 * centroid on concave/cul-de-sac shapes), and stores the full ring so geofence
 * containment checks run against the real lot boundary rather than a circle.
 *
 * Staff-triggered only (owner/manager session). The recurring self-resolve path
 * is /api/cron/parcel, hit hourly by pg_cron.
 *
 * POST { property_id }  → resolve one
 * POST { all: true }    → resolve every property missing a verified interior-pin fence
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.property_id && !body.all) {
    return NextResponse.json({ error: "property_id or all required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const results = await resolveAllUnresolvedProperties(db, body.property_id);
  const resolved = results.filter((r) => r.matched).length;

  await logAutomation({
    trigger: "crm.tracking-parcel",
    detail: { by: staff.full_name, total: results.length, resolved, unresolved: results.filter((r) => !r.matched).map((r) => ({ id: r.id, address: r.address })) },
  });

  return NextResponse.json({ ok: true, resolved, total: results.length, results });
}
