import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body.action === "quote") {
    const { data: services } = await db.from("services").select("name, base_price").in("slug", body.service_slugs ?? []);
    const items = (services ?? []).filter((s) => s.base_price != null).map((s) => ({ service: s.name, qty: 1, price: Number(s.base_price) }));
    const total = items.reduce((s, i) => s + i.price, 0);
    const { data: quote, error } = await db.from("quotes").insert({ lead_id: body.lead_id, line_items: items, total, status: "draft" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.quote_created", ref_id: quote.id, detail: { by: staff.full_name, total } });
    return NextResponse.json({ ok: true, quote_id: quote.id, total });
  }

  if (body.action === "checklist") {
    // Personal-quote checklist, captured on site by staff during the in-person visit.
    const fields = ["has_dog", "gate_width_in", "obstacles", "watering_day", "bags_clippings", "premium_handling", "haul_clippings"];
    const update: Record<string, unknown> = {};
    for (const f of fields) if (f in (body.checklist ?? {})) update[f] = body.checklist[f];
    const { error } = await db.from("leads").update(update).eq("id", body.lead_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.lead_checklist", ref_id: body.lead_id, detail: { by: staff.full_name, update } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
