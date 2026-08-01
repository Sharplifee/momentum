import { NextRequest, NextResponse } from "next/server";
import { suggestAddresses } from "@/lib/parcel";

export const runtime = "nodejs";

/** GET /api/tracking/address-suggest?q=2891 Highland — real parcels only. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 4) return NextResponse.json({ suggestions: [] });
  const suggestions = await suggestAddresses(q);
  return NextResponse.json({ suggestions });
}
