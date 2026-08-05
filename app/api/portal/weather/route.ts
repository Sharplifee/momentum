import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { corsHeaders, withCors } from "@/lib/portalCors";
import { customerFrom } from "@/lib/portalAuth";
export const runtime = "nodejs";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
/**
 * Forecast for a service date, by address. Thin wrapper over the CRM's own
 * weather route so the app does not need coordinates it never had.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const address = req.nextUrl.searchParams.get("address") ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? "";
  let lat = 40.5622, lng = -111.9297; // service-area centre

  if (address) {
    const { data } = await supabaseAdmin()
      .from("properties").select("lat, lng").ilike("address", `${address.split(",")[0]}%`)
      .not("lat", "is", null).limit(1).maybeSingle();
    if (data?.lat && data?.lng) { lat = data.lat; lng = data.lng; }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.momentumlandscapingut.com";
  const res = await fetch(`${base.replace(/\/$/, "")}/api/weather?lat=${lat}&lng=${lng}`, {
    next: { revalidate: 900 },
  }).catch(() => null);
  if (!res?.ok) return withCors({ error: "Weather isn't available right now." }, origin, 503);
  const w = await res.json();

  const day = date ? (w.days ?? []).find((d: any) => d.date === date) : (w.days ?? [])[0];
  return withCors({
    source: w.source,
    date: day?.date ?? null,
    highF: day?.highF ?? null,
    lowF: day?.lowF ?? null,
    precipitationChance: day?.precipitationChance ?? null,
    condition: day?.condition ?? null,
    days: w.days ?? [],
  }, origin);
}
