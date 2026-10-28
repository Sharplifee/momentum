import { NextRequest, NextResponse } from "next/server";
import { suggestAddresses } from "@/lib/parcel";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/** GET /api/tracking/address-suggest?q=2891 Highland — real parcels only. */
async function __GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 4) return NextResponse.json({ suggestions: [] });
  const suggestions = await suggestAddresses(q);
  return NextResponse.json({ suggestions });
}

export const GET = withEventLog("GET /api/tracking/address-suggest", __GET);
