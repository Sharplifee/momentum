import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { leadIntakeSchema } from "@/lib/zod/lead";
import { toE164 } from "@/lib/phone";
import { getAvailability } from "@/lib/availability";
import { sendSms } from "@/lib/sms";
import { composeNoraOpener } from "@/lib/noraOpener";
import { sendMetaCapiEvent, deriveFbc } from "@/lib/meta";
import { logAutomation } from "@/lib/automation";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";

// crude in-memory rate limit: 5/min/IP. Resets on cold start, which is fine —
// this is a spam speed-bump, not a security boundary.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Meta lead ads arrive server-to-server from /api/meta/leadgen, so every one
  // of them shares a single origin IP. Under the public 5/min limit a campaign
  // that actually works would start dropping leads on the floor. The bearer is
  // server-side only, so this can't be used to lift the limit from outside.
  const internal =
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (!internal && rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: cors });
  }

  const body = await req.json().catch(() => null);
  const parsed = leadIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400, headers: cors });
  }
  const input = parsed.data;

  // honeypot — silently accept but do nothing, so bots don't learn to adapt
  if (input.company_website || input.company) {
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const phone = toE164(input.phone);
  if (!phone) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400, headers: cors });
  }

  const db = supabaseAdmin();
  const isTest = req.headers.get("x-momentum-test") === "1";
  const declaredSource = req.headers.get("x-momentum-source");
  const source = isTest
    ? "test"
    : declaredSource === "meta_lead_ad" && internal
    ? "meta_lead_ad"
    : "website";

  // Attribution signals. These were being read for the CAPI call but never stored,
  // which capped est_emq at 2.5 no matter how many ad-sourced leads arrived —
  // v_attribution_quality scores fbc, client_ip and user_agent off the leads row.
  const userAgent = req.headers.get("user-agent") ?? null;
  const derivedFbc = deriveFbc(input.fbc ?? null, input.fbclid ?? null);

  // dedupe: same phone within 24h -> append a lead_event on the existing lead instead of creating a new one
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await db
    .from("leads")
    .select("id, zone_id")
    .eq("phone", phone)
    .gte("created_at", twentyFourHoursAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId: string;
  let zoneId: number | null = null;

  // punch list 1.1: resolve zone from city AND/OR free-text address, with default-zone fallback
  const { resolveZone } = await import("@/lib/zones");
  const resolved = await resolveZone(input.city, input.address);
  const matchedZoneId: number | null = resolved.zone_id;
  const resolvedCity = input.city ?? resolved.city;

  if (existing) {
    leadId = existing.id;
    zoneId = existing.zone_id ?? matchedZoneId;
    if (!existing.zone_id && matchedZoneId) {
      await db.from("leads").update({ zone_id: matchedZoneId, city: resolvedCity ?? null }).eq("id", leadId);
    }
    await db.from("lead_events").insert({
      lead_id: leadId,
      type: "repeat_submission",
      detail: { ...input, ip },
      actor: "system",
    });
  } else {
    const { data: inserted, error: insertErr } = await db
      .from("leads")
      .insert({
        full_name: input.full_name,
        phone,
        email: input.email || null,
        address: input.address,
        city: resolvedCity ?? null,
        zone_id: matchedZoneId,
        service_interest: input.service_interest ?? null,
        requested_window: input.requested_window ?? null,
        requested_days: input.requested_days?.length ? input.requested_days : null,
        source,
        fbclid: input.fbclid ?? null,
        fbp: input.fbp ?? null,
        fbc: derivedFbc,
        client_ip: ip !== "unknown" ? ip : null,
        user_agent: userAgent,
        utm: input.utm ?? null,
        landing_page: input.landing_page ?? null,
        referrer: input.referrer ?? null,
      })
      .select("id, zone_id")
      .single();

    if (insertErr || !inserted) {
      await logAutomation({ trigger: "leads.create", status: "error", error: insertErr?.message });
      return NextResponse.json({ error: "db_error" }, { status: 500, headers: cors });
    }
    leadId = inserted.id;
    zoneId = inserted.zone_id;

    await db.from("lead_events").insert({
      lead_id: leadId,
      type: "created",
      detail: { source, ip },
      actor: "system",
    });
  }

  // Meta CAPI Lead event (event_id = lead id so pixel-side Lead event dedupes against this)
  // external_id doubles as a match signal; store it so the same value is reused
  // by later Purchase/Schedule events for this lead.
  await db.from("leads").update({ external_id: leadId }).eq("id", leadId).is("external_id", null);

  await sendMetaCapiEvent({
    event_name: "Lead",
    event_id: leadId,
    email: input.email || null,
    phone,
    fbp: input.fbp,
    fbc: derivedFbc,
    fbclid: input.fbclid,
    external_id: leadId,
    lead_id: leadId,
    event_source_url: input.landing_page,
    client_ip: ip !== "unknown" ? ip : undefined,
    client_user_agent: userAgent ?? undefined,
  });

  // availability -> 2 real days
  const availableDays = await getAvailability(zoneId, 2); // never [] — global fallback inside

  // thread + confirmation SMS (skip actual send for synthetic test leads so Connor's phone isn't spammed)
  const { data: thread } = await db
    .from("threads")
    .insert({ lead_id: leadId, phone, escalated: false })
    .select("id")
    .single();

  // The old path rendered sms_templates.lead_confirmation, so every lead got a
  // byte-identical text. Identical texts read as a blast and get ignored, and an
  // ignored opener is exactly how a quote visit turns into a no-show. Compose it
  // instead, reading back the window and days the person actually picked, seeded
  // off the lead id so a retry re-sends the same words rather than new ones.
  const confirmationBody = composeNoraOpener({
    firstName: input.full_name.split(" ")[0],
    window: input.requested_window ?? null,
    days: input.requested_days ?? null,
    fallbackDays: availableDays
      .slice(0, 2)
      .map((d) => new Date(d.date).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Denver" })),
    seed: leadId,
  });

  if (!isTest) {
    await sendSms({ to: phone, message: confirmationBody, thread_id: thread?.id, sender: "nora" });
  } else {
    await logAutomation({ trigger: "sms.send.skipped_test_lead", ref_id: leadId, status: "skipped" });
  }

  // team alert per system_config.team_alerts mode
  const { data: alertCfg } = await db.from("system_config").select("value").eq("key", "team_alerts").single();
  const recipients = (alertCfg?.value?.mode === "launch"
    ? alertCfg.value.launch_recipients
    : alertCfg?.value?.recipients) as string[] | undefined;
  if (recipients?.length && !isTest) {
    for (const r of recipients) {
      await sendSms({
        to: r,
        message: `New lead: ${input.full_name} — ${input.address} (${phone}). Source: ${source}.`,
        sender: "system",
        bypassQuietHours: true,
      });
    }
  }

  await db
    .from("leads")
    .update({ first_response_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("first_response_at", null);

  await logAutomation({
    trigger: "leads.create",
    ref_id: leadId,
    status: "ok",
    detail: {
      phone,
      zone_id: zoneId,
      is_test: isTest,
      source,
      available_days: availableDays,
      requested_window: input.requested_window ?? null,
      requested_days: input.requested_days ?? null,
    },
  });

  return NextResponse.json({ ok: true, lead_id: leadId, thread_id: thread?.id, available_days: availableDays }, { headers: cors });
}
