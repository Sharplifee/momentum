import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The account's one-time location decision. Stored on the person, not the
 * device: profiles.notif_prefs.location = "granted" | "declined" (+ location_at).
 * Once it is set, the web app never asks again on its own — the browser's own
 * permission decides whether reports flow, and More › Location is the only
 * place a person can change their mind.
 */
async function me() {
  const { data: { user } } = await supabaseServer().auth.getUser();
  return user;
}

async function __GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin().from("profiles").select("notif_prefs").eq("id", user.id).maybeSingle();
  const prefs = (data?.notif_prefs ?? {}) as Record<string, unknown>;
  const consent = prefs.location === "granted" || prefs.location === "declined" ? prefs.location : null;
  return NextResponse.json({ consent, at: prefs.location_at ?? null });
}

async function __POST(req: NextRequest) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const consent = body.consent === "granted" ? "granted" : body.consent === "declined" ? "declined" : null;
  if (!consent) return NextResponse.json({ error: "consent must be granted or declined" }, { status: 400 });
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("notif_prefs").eq("id", user.id).maybeSingle();
  const prefs = { ...((data?.notif_prefs ?? {}) as Record<string, unknown>), location: consent, location_at: new Date().toISOString() };
  const { error } = await db.from("profiles").update({ notif_prefs: prefs }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAutomation({ trigger: "account.location_consent", ref_id: user.id, detail: { consent, via: String(body.via ?? "web") } });
  return NextResponse.json({ ok: true, consent });
}

export const GET = withEventLog("GET /api/crm/location", __GET);
export const POST = withEventLog("POST /api/crm/location", __POST);
