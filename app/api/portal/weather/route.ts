import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { corsHeaders, withCors } from "@/lib/portalCors";
import { customerFrom } from "@/lib/portalAuth";
export const runtime = "nodejs";

/**
 * WeatherKit names its conditions; the app speaks WMO codes, because its
 * offline path talks to Open-Meteo. Translating here keeps one shape coming out
 * of this route no matter which provider answered underneath.
 */
const WMO: Record<string, number> = {
  Clear: 0, MostlyClear: 1, PartlyCloudy: 2, MostlyCloudy: 3, Cloudy: 3,
  Foggy: 45, Fog: 45, Haze: 45, Smoky: 45,
  Drizzle: 51, Sleet: 66, FreezingDrizzle: 56, FreezingRain: 66,
  Rain: 61, HeavyRain: 65, Showers: 80, ScatteredShowers: 80, SunShowers: 80,
  Snow: 71, HeavySnow: 75, Flurries: 71, SnowShowers: 85, Blizzard: 75,
  Thunderstorms: 95, ScatteredThunderstorms: 95, IsolatedThunderstorms: 95, Hail: 96,
  Breezy: 1, Windy: 1, Hot: 0, Frigid: 3,
};
/**
 * Upstream speaks two dialects. WeatherKit names its conditions ("Rain"); Open-Meteo
 * already answers in WMO codes, and they arrive as strings ("55"). Running a number
 * through a name map missed every time and fell to the default 2 — so with WeatherKit
 * returning 401 and everything falling through to Open-Meteo, every forecast in the
 * app read "partly cloudy" regardless of the actual sky. Temps, rain and wind were
 * right the whole time, which is why it went unnoticed.
 *
 * Numbers pass through untouched; names still map; anything else falls back to 2.
 */
const toCode = (c?: string | number | null) => {
  if (c === null || c === undefined || c === "") return 2;
  const n = typeof c === "number" ? c : Number(String(c).trim());
  if (Number.isFinite(n)) return n;
  const name = String(c).trim();
  return WMO[name] !== undefined ? WMO[name] : 2;
};

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

  // A date in the past, or beyond the forecast window, matches nothing — fall
  // back to the nearest day we do have rather than answering with a row of
  // nulls the app cannot render.
  const days = w.days ?? [];
  const day = (date ? days.find((d: any) => d.date === date) : null) ?? days[0] ?? null;

  return withCors({
    source: w.source,
    date: day?.date ?? null,
    requestedDate: date || null,
    exact: Boolean(date && day?.date === date),

    // The app reads these five. They were missing entirely, so every live
    // forecast arrived as undefined and the home card showed nothing real.
    code: toCode(day?.condition),
    high: day?.highF ?? null,
    low: day?.lowF ?? null,
    rain: day?.precipitationChance != null ? Math.round(day.precipitationChance * 100) : null,
    wind: day?.windSpeedMax != null ? Math.round(day.windSpeedMax) : null,
    city: (address.split(",")[0] || "South Jordan").trim(),

    // Original WeatherKit names kept so nothing already reading them breaks.
    highF: day?.highF ?? null,
    lowF: day?.lowF ?? null,
    precipitationChance: day?.precipitationChance ?? null,
    condition: day?.condition ?? null,
    days,
  }, origin);
}
