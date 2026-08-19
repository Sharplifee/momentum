import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";
import { toE164 } from "@/lib/phone";

export const runtime = "nodejs";

/**
 * The only outbound SMS HTTP door (build plan 3.3). Internal server code
 * (leads route, Nora tools, cron) calls lib/sms.ts's sendSms() directly
 * for reliability; this route exists for anything that needs to trigger a
 * send over HTTP (CRM UI "quick SMS", Flow Tester, future staff tools).
 */
export async function POST(req: NextRequest) {
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
