import { NextRequest, NextResponse } from "next/server";
import { staffFromBearer, mintDeviceToken } from "@/lib/bearerAuth";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/**
 * Exchange a live session (Supabase access token, sent by the crew app while
 * the CRM is open and signed in) for a long-lived device token the app keeps
 * for background location and push registration. Device tokens cannot mint
 * device tokens: a fresh sign-in is always required.
 */
async function __POST(req: NextRequest) {
  const raw = req.headers.get("authorization") ?? "";
  if (/Bearer\s+mdt1\./i.test(raw)) return NextResponse.json({ error: "session required" }, { status: 401 });
  const staff = await staffFromBearer(req);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t = mintDeviceToken(staff.id);
  await logAutomation({ trigger: "crew_app.device_token", ref_id: staff.id, detail: { expires_at: t.expires_at } });
  return NextResponse.json(t);
}

export const POST = withEventLog("POST /api/crm/device-token", __POST);
