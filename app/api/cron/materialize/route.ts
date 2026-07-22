import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Nightly: materialize active service_agreements into jobs 14 days ahead (idempotent). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();

  const { data: seasonCfg } = await db.from("system_config").select("value").eq("key", "season").single();
  const season = seasonCfg?.value as { start: string; end: string } | undefined;

  const { data: agreements } = await db
    .from("service_agreements")
    .select("id, customer_id, property_id, service_id, frequency, day_of_week, price_per_visit, crew_id, season_start, season_end, properties(zone_id)")
    .eq("active", true);

  let created = 0;
  const today = new Date();
  const year = today.getFullYear();

  for (const ag of agreements ?? []) {
    const seasonStart = ag.season_start ?? (season ? `${year}-${season.start}` : null);
    const seasonEnd = ag.season_end ?? (season ? `${year}-${season.end}` : null);
    const stepDays = ag.frequency === "biweekly" ? 14 : ag.frequency === "monthly" ? 28 : 7;
    if (ag.frequency === "one_time") continue;

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      if (seasonStart && iso < seasonStart) continue;
      if (seasonEnd && iso > seasonEnd) continue;
      if (ag.day_of_week != null && d.getDay() !== ag.day_of_week) continue;
      if (ag.day_of_week == null && d.getDay() !== 5) continue; // default Friday if unset

      // biweekly/monthly cadence: anchor on the agreement's created week
      if (stepDays > 7) {
        const anchor = new Date(`${year}-01-01`);
        const weeksSince = Math.floor((d.getTime() - anchor.getTime()) / (7 * 86400_000));
        if (stepDays === 14 && weeksSince % 2 !== 0) continue;
        if (stepDays === 28 && weeksSince % 4 !== 0) continue;
      }

      // idempotent on agreement_id+date
      const { data: existing } = await db
        .from("jobs")
        .select("id")
        .eq("agreement_id", ag.id)
        .eq("scheduled_date", iso)
        .maybeSingle();
      if (existing) continue;

      const zoneId = (ag as any).properties?.zone_id ?? null;
      let crewId = ag.crew_id;
      if (!crewId && zoneId) {
        const { data: crew } = await db.from("crews").select("id").eq("home_zone", zoneId).eq("active", true).limit(1).maybeSingle();
        crewId = crew?.id ?? null;
      }

      const { error } = await db.from("jobs").insert({
        customer_id: ag.customer_id,
        property_id: ag.property_id,
        service_id: ag.service_id,
        agreement_id: ag.id,
        crew_id: crewId,
        zone_id: zoneId,
        scheduled_date: iso,
        status: "scheduled",
        price: ag.price_per_visit,
      });
      if (!error) created++;
    }
  }

  // lazy geocode: up to 10 ungeocoded properties per night via Nominatim (free tier etiquette: 1 req/s)
  const { data: ungeo } = await db.from("properties").select("id, address, city, state").is("lat", null).limit(10);
  let geocoded = 0;
  for (const p of ungeo ?? []) {
    try {
      const q = encodeURIComponent(`${p.address}, ${p.city ?? ""}, ${p.state ?? "UT"}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
        headers: { "User-Agent": "momentum-landscaping (admin@momentumlandscapingut.com)" },
      });
      const hits = await res.json();
      if (hits?.[0]) {
        await db.from("properties").update({ lat: Number(hits[0].lat), lng: Number(hits[0].lon), geocoded_at: new Date().toISOString() }).eq("id", p.id);
        geocoded++;
      }
      await new Promise((r) => setTimeout(r, 1100));
    } catch { /* skip */ }
  }

  await logAutomation({ trigger: "cron.materialize", detail: { agreements: agreements?.length ?? 0, jobs_created: created, geocoded } });
  return NextResponse.json({ ok: true, created });
}
