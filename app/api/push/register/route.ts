import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * The crew app and the customer app both post their push token here after the
 * user grants permission.
 * Tokens are unique per install and iOS reissues them on reinstall, so the
 * upsert re-points an existing token at whoever is signed in now.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew", "customer"]);
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
      // Which app minted this token. Apple matches it against apns-topic and
      // permanently rejects a mismatch, so it has to be stored per token.
      bundle_id: bundle_id ?? "com.momentumlandscapingut.crew",
      app_version: app_version ?? null,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Called on sign-out so a shared phone stops receiving the last user's alerts. */
export async function DELETE(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew", "customer"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const db = supabaseAdmin();
  await db.from("push_tokens").update({ active: false }).eq("token", token).eq("profile_id", staff.id);
  return NextResponse.json({ ok: true });
}
