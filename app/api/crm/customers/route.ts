import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";
import { toE164 } from "@/lib/phone";
import { resolveZone } from "@/lib/zones";

export const runtime = "nodejs";

const PLAN_SERVICE: Record<string, string> = { weekly: "weekly-mow", biweekly: "biweekly-mow" };

/**
 * Customers the owner adds by hand — the handshake deals that never came
 * through a lead. One call makes the customer, the property and (for a
 * weekly / biweekly plan) the agreement the schedule generates from.
 *
 * action "property" edits the curb-side notes the crew sees on every stop.
 */
async function __POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body.action === "create") {
    const fullName = String(body.full_name ?? "").trim().replace(/\s+/g, " ");
    const phone = toE164(String(body.phone ?? ""));
    const address = String(body.address ?? "").trim();
    const city = String(body.city ?? "").trim() || null;
    const email = String(body.email ?? "").trim() || null;
    const plan = String(body.plan ?? "one_off");
    if (fullName.length < 2) return NextResponse.json({ error: "Enter their name." }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "That mobile number doesn't look right." }, { status: 400 });
    if (address.length < 4) return NextResponse.json({ error: "Enter the service address." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });

    const price = Number(body.price_per_visit);
    const dow = Number(body.day_of_week);
    if (PLAN_SERVICE[plan] && !(price > 0)) return NextResponse.json({ error: "Enter the per-visit price you agreed." }, { status: 400 });
    if (PLAN_SERVICE[plan] && !(dow >= 0 && dow <= 6)) return NextResponse.json({ error: "Pick the service day." }, { status: 400 });

    const { data: dupe } = await db.from("customers").select("id, full_name").eq("phone", phone).maybeSingle();
    if (dupe) return NextResponse.json({ error: `${dupe.full_name} already has this number.`, customer_id: dupe.id }, { status: 409 });

    const parts = fullName.split(" ");
    const first_name = parts[0];
    const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;
    const zone = await resolveZone(city, address);

    const { data: customer, error: cErr } = await db.from("customers").insert({
      full_name: fullName, first_name, last_name, phone, email, status: "active", source: "handshake",
    }).select("id").single();
    if (cErr || !customer) return NextResponse.json({ error: cErr?.message ?? "insert failed" }, { status: 400 });

    const { data: property, error: pErr } = await db.from("properties").insert({
      customer_id: customer.id, address, city: zone.city ?? city, zone_id: zone.zone_id, postal: String(body.postal ?? "").trim() || null,
    }).select("id").single();
    if (pErr || !property) return NextResponse.json({ error: pErr?.message ?? "property insert failed" }, { status: 400 });

    let agreementId: string | null = null;
    if (PLAN_SERVICE[plan]) {
      const { data: service } = await db.from("services").select("id").eq("slug", PLAN_SERVICE[plan]).maybeSingle();
      if (service) {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
        const { data: ag } = await db.from("service_agreements").insert({
          customer_id: customer.id, property_id: property.id, service_id: service.id, frequency: plan,
          day_of_week: dow, price_per_visit: price, season_start: today, crew_id: body.crew_id ?? null, active: true,
        }).select("id").single();
        agreementId = ag?.id ?? null;
      }
    }

    let texted = false;
    if (body.welcome_text) {
      const { sendSms } = await import("@/lib/sms");
      const r = await sendSms({
        to: phone,
        message: `Momentum Landscaping — ${first_name}, you're all set. We'll text you the day before each visit, and you can reply here any time to reach us. Reply STOP to opt out.`,
        sender: "system", template: "welcome",
      });
      texted = r.ok;
    }

    await logAutomation({ trigger: "crm.customer_create", ref_id: customer.id, detail: { by: staff.full_name, plan, zone_id: zone.zone_id, agreement_id: agreementId, texted } });
    return NextResponse.json({ ok: true, customer_id: customer.id, property_id: property.id, agreement_id: agreementId, zone_id: zone.zone_id, texted });
  }

  if (body.action === "property") {
    const { property_id, customer_id, patch } = body;
    if (!property_id || !customer_id) return NextResponse.json({ error: "property_id and customer_id required" }, { status: 400 });
    const allowed = ["gate_code", "gate_width_in", "access_notes", "pets", "has_dog", "lot_notes", "obstacles", "watering_day", "bags_clippings", "haul_clippings"];
    const update: Record<string, unknown> = {};
    for (const f of allowed) if (f in (patch ?? {})) update[f] = patch[f];
    if (typeof update.gate_width_in === "string") update.gate_width_in = update.gate_width_in === "" ? null : Number(update.gate_width_in);
    if (update.gate_width_in != null && !Number.isFinite(update.gate_width_in as number)) return NextResponse.json({ error: "Gate width must be a number of inches." }, { status: 400 });
    for (const f of ["gate_code", "access_notes", "pets", "lot_notes", "watering_day"]) if (typeof update[f] === "string" && !(update[f] as string).trim()) update[f] = null;
    if (Array.isArray(update.obstacles)) update.obstacles = (update.obstacles as unknown[]).map((o) => String(o).trim()).filter(Boolean);
    const { error } = await db.from("properties").update(update).eq("id", property_id).eq("customer_id", customer_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.property_notes", ref_id: property_id, detail: { by: staff.full_name, fields: Object.keys(update) } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

/** Recent visits for a customer — the New invoice form attaches a line to one. */
async function __GET(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  const db = supabaseAdmin();
  const [{ data: jobs }, { data: customer }] = await Promise.all([
    db.from("jobs").select("id, scheduled_date, status, price, services(name), crews(name)").eq("customer_id", customerId).neq("status", "cancelled").order("scheduled_date", { ascending: false }).limit(12),
    db.from("customers").select("id, full_name, phone, email").eq("id", customerId).maybeSingle(),
  ]);
  return NextResponse.json({
    customer,
    jobs: (jobs ?? []).map((j: any) => ({ id: j.id, date: j.scheduled_date, status: j.status, price: j.price, service: j.services?.name ?? "Visit", crew: j.crews?.name ?? null })),
  });
}

export const GET = withEventLog("GET /api/crm/customers", __GET);
export const POST = withEventLog("POST /api/crm/customers", __POST);
