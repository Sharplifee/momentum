import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { staffFromBearer } from "@/lib/bearerAuth";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Background location from the native crew app (momentum-crew src/tracking.ts).
 *
 * The iOS background task posts a batch of fixes with a Bearer token, with no
 * page open — so this is the Bearer twin of /api/tracking/ping, which serves
 * the in-page reporter via cookies. Same tables, same Postgres geofence
 * trigger; the only difference is how the caller is identified.
 *
 * Body: { pings: [{ lat, lng, accuracy_m?, speed_mps?, recorded_at? }], device_key? }
 */
type Ping = { lat: number; lng: number; accuracy_m?: number | null; speed_mps?: number | null; recorded_at?: string | null };

async function __POST(req: NextRequest) {
  const staff = await staffFromBearer(req);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { pings?: Ping[]; device_key?: string } | null;
  const pings = (body?.pings ?? []).filter((p) => typeof p?.lat === "number" && typeof p?.lng === "number");
  if (!pings.length) return NextResponse.json({ error: "pings required" }, { status: 400 });

  const db = supabaseAdmin();
  const latest = pings[pings.length - 1];
  const now = new Date().toISOString();
  const deviceKey = body?.device_key || `native:${staff.id}`;

  const { data: device } = await db
    .from("tracked_devices")
    .upsert(
      {
        profile_id: staff.id,
        device_key: deviceKey,
        user_agent: "momentum-crew-native",
        platform: "ios",
        last_seen_at: now,
        last_batch_at: now,
        last_lat: latest.lat,
        last_lng: latest.lng,
        last_accuracy: latest.accuracy_m ?? null,
        consent_at: now,
        active: true,
      },
      { onConflict: "profile_id,device_key" }
    )
    .select("id, pings_received")
    .single();
  if (!device) return NextResponse.json({ error: "device registration failed" }, { status: 500 });

  const rows = pings.map((p) => ({
    device_id: device.id,
    profile_id: staff.id,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy_m ?? null,
    speed: p.speed_mps ?? null,
    recorded_at: p.recorded_at ?? now,
  }));
  const { error } = await db.from("location_pings").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("tracked_devices")
    .update({ pings_received: (device.pings_received ?? 0) + rows.length })
    .eq("id", device.id);

  return NextResponse.json({ ok: true, accepted: rows.length });
}

export const POST = withEventLog("POST /api/crm/ping", __POST);
