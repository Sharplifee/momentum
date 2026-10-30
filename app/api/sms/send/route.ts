import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";
import { staffFromSession } from "@/lib/apiAuth";
import { toE164 } from "@/lib/phone";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/**
 * The only outbound SMS HTTP door (build plan 3.3). Internal server code
 * (leads route, Norma tools, cron) calls lib/sms.ts's sendSms() directly
 * for reliability; this route exists for anything that needs to trigger a
 * send over HTTP (CRM UI "quick SMS", Flow Tester, future staff tools).
 */
async function __POST(req: NextRequest) {
  // Staff session (CRM UI) or the server secret (internal tools). Without this
  // the route was an open, unauthenticated SMS sender on the public internet.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const internal = Boolean(process.env.CRON_SECRET) && bearer === process.env.CRON_SECRET;
  const staff = internal ? null : await staffFromSession(["owner", "manager", "crew"]);
  if (!internal && !staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.to || !body?.message) {
    return NextResponse.json({ error: "to and message are required" }, { status: 400 });
  }
  const to = toE164(String(body.to));
  if (!to) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }
  const result = await sendSms({
    to,
    message: String(body.message),
    thread_id: body.thread_id ?? null,
    sender: body.sender ?? "staff",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message_id: result.message_id });
}

export const POST = withEventLog("POST /api/sms/send", __POST);
