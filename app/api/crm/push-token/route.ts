import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { staffFromBearer } from "@/lib/bearerAuth";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/**
 * Push-token registration from the native crew app (momentum-crew App.tsx),
 * which posts { token, platform } with a Bearer token right after iOS grants
 * notification permission. Bearer twin of /api/push/register (cookie session).
 */
async function __POST(req: NextRequest) {
  const staff = await staffFromBearer(req);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { token, platform, app_version, device_id, bundle_id } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("push_tokens").upsert(
    {
      token,
      profile_id: staff.id,
      device_id: device_id ?? null,
      platform: platform ?? "ios",
      bundle_id: bundle_id ?? "com.momentumlandscapingut.crew",
      app_version: app_version ?? null,
      active: true,
      failure_count: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export const POST = withEventLog("POST /api/crm/push-token", __POST);
