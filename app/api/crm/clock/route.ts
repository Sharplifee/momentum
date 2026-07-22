import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";

export const runtime = "nodejs";

/** Today-view clock in/out/exception — proxies to the crew webhook with the server secret. */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const base = process.env.APP_BASE_URL || `https://${req.headers.get("host")}`;
  const res = await fetch(`${base}/api/webhooks/crew`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ ...body, actor: staff.full_name ?? staff.id }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
