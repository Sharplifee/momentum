import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/crm";

export const runtime = "nodejs";

/**
 * Everything the schedule map draws, in one call.
 *
 * Service stops carry their real surveyed parcel boundary where we have one —
 * a circle overshoots these lots by 117% to 525%, so the true shape is both
 * more honest and more useful. Quote visits are leads, which usually have no
 * parcel yet, so they are a pin only.
 */
export async function GET(req: NextRequest) {
  const staff = await requireStaff(["owner", "manager", "crew"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = req.nextUrl.searchParams.get("to") ?? from;

  const db = supabaseAdmin();

  const [{ data: jobs }, { data: quotes }] = await Promise.all([
    db.from("jobs")
      .select(`id, scheduled_date, status,
               customers!inner ( id, full_name ),
               properties!inner ( id, address, city, lat, lng, parcel_ring, geofence_m )`)
      .gte("scheduled_date", from).lte("scheduled_date", to)
      .order("scheduled_date"),
    db.from("leads")
      .select("id, full_name, address, city, lat, lng, quote_visit_date, stage")
      .gte("quote_visit_date", from).lte("quote_visit_date", to),
  ]);

  const service = (jobs ?? [])
    .filter((j: any) => j.properties?.lat && j.properties?.lng)
    .map((j: any) => ({
      id: j.id,
      kind: "service" as const,
      date: j.scheduled_date,
      status: j.status,
      name: j.customers?.full_name ?? "Customer",
      address: j.properties.address,
      city: j.properties.city,
      lat: j.properties.lat,
      lng: j.properties.lng,
      // The real lot, not an approximation of it.
      ring: j.properties.parcel_ring ?? null,
      radius_m: j.properties.parcel_ring ? null : (j.properties.geofence_m ?? 45),
    }));

  const quote = (quotes ?? [])
    .filter((l: any) => l.lat && l.lng)
    .map((l: any) => ({
      id: l.id,
      kind: "quote" as const,
      date: l.quote_visit_date,
      status: l.stage,
      name: l.full_name ?? "Lead",
      address: l.address,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      ring: null,
      radius_m: null,
    }));

  const all = [...service, ...quote];
  const lats = all.map((s) => s.lat), lngs = all.map((s) => s.lng);

  return NextResponse.json({
    from, to,
    counts: { service: service.length, quote: quote.length },
    stops: all,
    // So the map can frame the day without the client doing the maths.
    bounds: all.length
      ? { north: Math.max(...lats), south: Math.min(...lats),
          east: Math.max(...lngs), west: Math.min(...lngs) }
      : null,
    mapkit_token: process.env.MAPKIT_TOKEN ?? null,
  });
}
