import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { staffFromSession } from "@/lib/apiAuth";

export const runtime = "nodejs";

/**
 * Closing a quote, from the driveway.
 *
 * The person standing at the property sets the price and the service day —
 * both unique to the lot, neither guessable. One call creates the customer, the
 * property carrying every checklist answer, and twelve weeks of scheduled work,
 * so the calendar and the map are real before they get back in the truck.
 *
 * This is also the ONLY place a conversion is reported to Meta. Firing when a
 * quote visit is booked would teach it to find people who book visits rather
 * than people who buy.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { lead_id, price, service_day } = await req.json().catch(() => ({}));
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  if (!price || Number(price) <= 0) {
    return NextResponse.json({ error: "Enter the price you quoted." }, { status: 400 });
  }
  if (service_day === undefined || service_day === null) {
    return NextResponse.json({ error: "Pick the service day you agreed." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("momentum_close_lead", {
    p_lead: lead_id,
    p_price: Number(price),
    p_service_day: Number(service_day),
    p_closed_by: staff.id ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!(data as any)?.ok) {
    return NextResponse.json({ error: (data as any)?.error ?? "close failed" }, { status: 400 });
  }

  const result = data as any;

  // Meta hears about it here and nowhere else.
  try {
    const { data: lead } = await db.from("leads")
      .select("phone, email, full_name, city").eq("id", lead_id).maybeSingle();
    if (process.env.META_CAPI_TOKEN && process.env.META_DATASET_ID && lead) {
      const { createHash } = await import("crypto");
      const h = (v?: string | null) =>
        v ? createHash("sha256").update(v.trim().toLowerCase()).digest("hex") : undefined;
      await fetch(
        `https://graph.facebook.com/v26.0/${process.env.META_DATASET_ID}/events?access_token=${process.env.META_CAPI_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [{
              event_name: "Purchase",
              event_time: Math.floor(Date.now() / 1000),
              action_source: "system_generated",
              event_id: `close_${lead_id}`,   // dedupes against the pixel
              user_data: {
                ph: h(lead.phone?.replace(/\D/g, "")),
                em: h(lead.email),
                ct: h(lead.city),
                country: h("us"),
              },
              custom_data: {
                currency: "USD",
                // What the subscription is worth over a season, not one mow —
                // Meta optimises against the number it is given.
                value: Number(price) * 28,
              },
            }],
          }),
        }
      );
    }
  } catch {
    /* a reporting failure must never undo a sale */
  }

  return NextResponse.json(result);
}
