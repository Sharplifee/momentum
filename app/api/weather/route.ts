import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";

export const runtime = "nodejs";
export const revalidate = 900; // Apple rate-limits; a 15-minute forecast is plenty

/**
 * WeatherKit proxy.
 *
 * Apple's WeatherKit REST API needs a token signed with the team's private key.
 * That key must never reach a phone or a browser, so the app asks us and we
 * sign here. It also means one cached response serves every customer in the
 * same area rather than each device hitting Apple separately.
 *
 * Falls through to Open-Meteo when WeatherKit is not configured — free, no key,
 * and accurate enough for "will it rain on my lawn". A customer should never see
 * an empty weather panel because a credential is missing.
 */

let cachedToken: { token: string; exp: number } | null = null;

function weatherKitToken(): string | null {
  const keyId = process.env.WEATHERKIT_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const serviceId = process.env.WEATHERKIT_SERVICE_ID;
  const p8 = (process.env.WEATHERKIT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!keyId || !teamId || !serviceId || !p8) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 300 > now) return cachedToken.token;

  const b64 = (x: string | Buffer) =>
    Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const exp = now + 3600;
  const header = b64(JSON.stringify({ alg: "ES256", kid: keyId, id: `${teamId}.${serviceId}` }));
  const claims = b64(JSON.stringify({ iss: teamId, iat: now, exp, sub: serviceId }));

  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  const der = signer.sign(p8);

  // DER -> JOSE r||s
  let o = 2;
  if (der[1] & 0x80) o += der[1] & 0x7f;
  const rLen = der[o + 1];
  const r = der.subarray(o + 2, o + 2 + rLen);
  const sStart = o + 2 + rLen;
  const s = der.subarray(sStart + 2, sStart + 2 + der[sStart + 1]);
  const pad = (b: Buffer) => {
    const out = Buffer.alloc(32);
    const t = b[0] === 0 ? b.subarray(1) : b;
    t.copy(out, 32 - t.length);
    return out;
  };
  const token = `${header}.${claims}.${b64(Buffer.concat([pad(r), pad(s)]))}`;
  cachedToken = { token, exp };
  return token;
}

async function fromWeatherKit(lat: number, lng: number) {
  const token = weatherKitToken();
  if (!token) return null;
  const url =
    `https://weatherkit.apple.com/api/v1/weather/en_US/${lat}/${lng}` +
    `?dataSets=currentWeather,forecastDaily`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 900 },
  }).catch(() => null);
  if (!res?.ok) return null;
  const d = await res.json();
  const today = d?.forecastDaily?.days?.[0];
  return {
    source: "weatherkit",
    current: {
      tempF: cToF(d?.currentWeather?.temperature),
      condition: d?.currentWeather?.conditionCode,
    },
    days: (d?.forecastDaily?.days ?? []).slice(0, 7).map((x: any) => ({
      date: x.forecastStart?.slice(0, 10),
      highF: cToF(x.temperatureMax),
      lowF: cToF(x.temperatureMin),
      precipitationChance: x.precipitationChance,
      windSpeedMax: x.windSpeedMax,
      condition: x.conditionCode,
    })),
    today: today ? { precipitationChance: today.precipitationChance, windSpeedMax: today.windSpeedMax } : null,
  };
}

async function fromOpenMeteo(lat: number, lng: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,` +
    `precipitation_probability_max,wind_speed_10m_max,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;
  const res = await fetch(url, { next: { revalidate: 900 } }).catch(() => null);
  if (!res?.ok) return null;
  const d = await res.json();
  const days = (d?.daily?.time ?? []).map((t: string, i: number) => ({
    date: t,
    highF: d.daily.temperature_2m_max?.[i],
    lowF: d.daily.temperature_2m_min?.[i],
    precipitationChance: (d.daily.precipitation_probability_max?.[i] ?? 0) / 100,
    windSpeedMax: d.daily.wind_speed_10m_max?.[i],
    condition: String(d.daily.weather_code?.[i] ?? ""),
  }));
  return {
    source: "open-meteo",
    timezone: d?.timezone ?? null,
    current: { tempF: d?.current?.temperature_2m, condition: String(d?.current?.weather_code ?? "") },
    days,
    today: days[0] ? { precipitationChance: days[0].precipitationChance, windSpeedMax: days[0].windSpeedMax } : null,
  };
}

const cToF = (c: number | undefined) => (typeof c === "number" ? Math.round((c * 9) / 5 + 32) : undefined);

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  // Anywhere on Earth. This used to fence to the Salt Lake valley and reject
  // everything else as "outside service area" — but weather is about where the
  // person is standing, not where we mow. A customer travelling, or one whose
  // property sits just outside the box, got a 400 and an empty panel.
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lat and lng out of range" }, { status: 400 });
  }

  const data = (await fromWeatherKit(lat, lng)) ?? (await fromOpenMeteo(lat, lng));
  if (!data) return NextResponse.json({ error: "weather unavailable" }, { status: 503 });
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
  });
}
