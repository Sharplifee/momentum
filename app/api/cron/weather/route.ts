import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

// approximate zone centroids (northern Utah County / SW Salt Lake County)
const ZONE_COORDS: Record<number, [number, number]> = {
  1: [40.4181, -111.8722], 2: [40.3833, -111.8500], 3: [40.3491, -111.9047],
  4: [40.3141, -112.0069], 5: [40.3769, -111.7958], 6: [40.5247, -111.8638],
  7: [40.5622, -111.9297], 8: [40.5141, -112.0329],
};

/** 6:10 MT: NWS rain-risk check per zone with jobs today; flag + owner alert with push-day option. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const simulateZone = req.nextUrl.searchParams.get("simulate_zone"); // test hook (rain flag simulation)

  const { data: jobs } = await db
    .from("jobs")
    .select("id, zone_id")
    .eq("scheduled_date", today)
    .eq("status", "scheduled");

  const zonesWithJobs = [...new Set((jobs ?? []).map((j) => j.zone_id).filter(Boolean))] as number[];
  const flagged: number[] = [];

  for (const zoneId of zonesWithJobs) {
    let rainRisk = false;
    if (simulateZone && Number(simulateZone) === zoneId) {
      rainRisk = true;
    } else {
      const coords = ZONE_COORDS[zoneId];
      if (!coords) continue;
      try {
        const pt = await fetch(`https://api.weather.gov/points/${coords[0]},${coords[1]}`, {
          headers: { "User-Agent": "momentum-landscaping (admin@momentumlandscapingut.com)" },
        }).then((r) => r.json());
        const fc = await fetch(pt.properties.forecastHourly, {
          headers: { "User-Agent": "momentum-landscaping (admin@momentumlandscapingut.com)" },
        }).then((r) => r.json());
        const next12 = (fc.properties?.periods ?? []).slice(0, 12);
        rainRisk = next12.some((p: any) => (p.probabilityOfPrecipitation?.value ?? 0) >= 60);
      } catch {
        continue; // NWS hiccup — skip zone, don't fail the cron
      }
    }
    if (rainRisk) {
      flagged.push(zoneId);
      await db.from("jobs").update({ weather_flag: true }).eq("scheduled_date", today).eq("zone_id", zoneId).eq("status", "scheduled");
    }
  }

  if (flagged.length) {
    const base = process.env.APP_BASE_URL || "https://momentum-ten-psi.vercel.app";
    await sendSms({
      to: "+13853076535",
      message: `☔ Rain risk today in zone(s) ${flagged.join(", ")} — jobs flagged. Push day: ${base}/crm/jobs?push_zones=${flagged.join(",")}`,
      sender: "system",
      bypassQuietHours: true,
    });
  }

  await logAutomation({ trigger: "cron.weather", detail: { date: today, zones_checked: zonesWithJobs, flagged, simulated: Boolean(simulateZone) } });
  return NextResponse.json({ ok: true, flagged });
}
