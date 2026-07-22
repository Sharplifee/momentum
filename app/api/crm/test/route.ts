import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 120;

/** CRM wrapper for the Flow Tester — owner session auth instead of CRON_SECRET. */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const base = process.env.APP_BASE_URL || `https://${req.headers.get("host")}`;
  const res = await fetch(`${base}/api/test/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
