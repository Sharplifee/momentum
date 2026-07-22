import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { sendSms } from "@/lib/sms";
import { toE164 } from "@/lib/phone";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { to, message, thread_id } = await req.json().catch(() => ({}));
  const phone = toE164(String(to ?? ""));
  if (!phone || !message) return NextResponse.json({ error: "to and message required" }, { status: 400 });
  const r = await sendSms({ to: phone, message: String(message), thread_id: thread_id ?? null, sender: "staff" });
  return NextResponse.json(r, { status: r.ok || r.reason === "queued_quiet_hours" ? 200 : 502 });
}
