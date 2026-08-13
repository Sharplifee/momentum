import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";

/**
 * The customer texted back with a day.
 *
 * That reply is the point of offering time slots rather than a calendar: it
 * turns a form submission into a conversation, and the reply is a second
 * confirmation without anyone having to ring them out of the blue.
 *
 * Booking it here puts the visit on the calendar and the map, geocodes the
 * address so whoever drives out can see the lot, and tells all three admins.
 *
 * The lead stays a lead. This is not a sale, and nothing is reported to Meta.
 */
export async function POST(req: NextRequest) {
  const { lead_id, date, window } = await req.json().catch(() => ({}));
  if (!lead_id || !date) {
    return NextResponse.json({ error: "lead_id and date required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: lead } = await db.from("leads")
    .select("id, full_name, phone, address, city, requested_window, lat, lng, stage")
    .eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  // Geocode now rather than at close, so the map is right for the person
  // driving to the quote — that is who needs it, and they need it first.
  let lat = lead.lat, lng = lead.lng;
  if (!lat || !lng) {
    try {
      const q = encodeURIComponent(`${lead.address}, ${lead.city}, UT`);
      const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=2020&format=json`);
      const j = await r.json();
      const m = j?.result?.addressMatches?.[0]?.coordinates;
      if (m) { lat = m.y; lng = m.x; }
    } catch { /* an un-geocoded visit is still a visit */ }
  }

  await db.from("leads").update({
    stage: "quote_scheduled",
    quote_visit_date: date,
    quote_visit_window: window ?? lead.requested_window,
    lat, lng,
  }).eq("id", lead_id);

  // All three admins, because whoever is nearest may take it.
  const when = new Date(`${date}T12:00:00`).toLocaleDateString("en-US",
    { weekday: "long", month: "short", day: "numeric" });
  const note = `Quote booked — ${lead.full_name ?? "New lead"}, ${when}` +
               `${window ? ` ${window}` : ""}. ${lead.address}, ${lead.city}.`;

  const { data: admins } = await db.from("profiles")
    .select("phone").in("role", ["owner", "manager"]).not("phone", "is", null);
  for (const a of admins ?? []) {
    await sendSms({ to: a.phone as string, message: note }).catch(() => null);
  }

  return NextResponse.json({ ok: true, date, lat, lng, notified: (admins ?? []).length });
}
