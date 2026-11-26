import { NextRequest, NextResponse } from "next/server";
import { getAvailability } from "@/lib/availability";
import { withEventLog } from "@/lib/eventLog";
import { staffFromSession } from "@/lib/apiAuth";

export const runtime = "nodejs";

async function __GET(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const zone = url.searchParams.get("zone");
  const count = Number(url.searchParams.get("count") ?? 10);
  const days = await getAvailability(zone ? Number(zone) : null, Math.max(1, Math.min(10, count)));
  return NextResponse.json({ days });
}

export const GET = withEventLog("GET /api/crm/availability", __GET);
