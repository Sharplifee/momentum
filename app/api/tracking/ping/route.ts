import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Device position report. Authenticated by the caller's own session — every logged-in device reports. */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { lat, lng, accuracy, speed, device_key, user_agent, platform } = body ?? {};
  if (typeof lat !== "number" || typeof lng !== "number" || !device_key) {
    return NextResponse.json({ error: "lat, lng, device_key required" }, { status: 400 });
  }

  // Desktop browsers are not crew. A laptop parked at a desk sits inside a
  // client geofence all day and manufactures fake visits. Enforced here rather
  // than client-side, because the upsert below re-activates any device that
  // pings — so deactivating one in the database does nothing on its own.
  const ua = (user_agent ?? "").toLowerCase();
  const plat = (platform ?? "").toLowerCase();
  const isMobile =
    /iphone|ipad|android/.test(ua) ||
    /^(ios|android)$/.test(plat) ||
    /iphone|ipad|android/.test(plat);
  if (!isMobile) {
    return NextResponse.json({ ok: true, ignored: "non_mobile_device" });
  }

  const db = supabaseAdmin();

  // Register / refresh the device
  const { data: device } = await db
    .from("tracked_devices")
    .upsert(
      {
        profile_id: user.id,
        device_key,
        user_agent: user_agent ?? null,
        platform: platform ?? null,
        last_seen_at: new Date().toISOString(),
        last_lat: lat,
        last_lng: lng,
        last_accuracy: accuracy ?? null,
        consent_at: new Date().toISOString(),
        active: true,
      },
      { onConflict: "profile_id,device_key" }
    )
    .select("id")
    .single();

  if (!device) return NextResponse.json({ error: "device registration failed" }, { status: 500 });

  await db.from("location_pings").insert({
    device_id: device.id,
    profile_id: user.id,
    lat, lng,
    accuracy: accuracy ?? null,
    speed: speed ?? null,
  });

  // Geofencing is handled in Postgres by trg_momentum_ping_ingest, which runs
  // momentum_process_ping against the surveyed parcel polygon. Nothing to do here.
  return NextResponse.json({ ok: true });
}
