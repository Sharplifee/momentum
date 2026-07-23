import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveParcel } from "@/lib/parcel";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Parcel-accurate geofencing for any property.
 *
 * Queries Utah's statewide parcel layer (1.59M surveyed polygons) by address,
 * computes the true centroid and the exact distance to the farthest boundary
 * vertex — the smallest circle that fully contains the lot. No estimates.
 *
 * POST { property_id }  → resolve one
 * POST { all: true }    → resolve every property missing a verified parcel
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  let q = db.from("properties").select("id, address, city, state, geocode_source");
  if (body.property_id) q = q.eq("id", body.property_id);
  else if (body.all) q = q.or("geocode_source.is.null,geocode_source.neq.ugrc_parcel");
  else return NextResponse.json({ error: "property_id or all required" }, { status: 400 });

  const { data: props } = await q;
  const results = [];
  for (const p of props ?? []) {
    const parcel = await resolveParcel(p.address, p.city);
    if (parcel) {
      await db.from("properties").update({
        lat: parcel.lat,
        lng: parcel.lng,
        geofence_radius_m: Math.max(parcel.radius_m, 25),
        parcel_address: parcel.parcel_address,
        geocode_source: "ugrc_parcel",
        geocoded_at: new Date().toISOString(),
      }).eq("id", p.id);
      results.push({ id: p.id, address: p.address, matched: parcel.parcel_address, radius_m: parcel.radius_m, score: parcel.score });
    } else {
      results.push({ id: p.id, address: p.address, matched: null, note: "no parcel found in Utah's records" });
    }
  }
  return NextResponse.json({ ok: true, resolved: results.filter((r) => r.matched).length, total: results.length, results });
}
