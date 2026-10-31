import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";
import { sendSms } from "@/lib/sms";
import { runStageAutomation } from "@/lib/stages";

export const runtime = "nodejs";

async function __POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body.action === "quote") {
    if (!body.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    // Line items come either from the quote builder (priced on site) or, the
    // legacy way, as service slugs at base price.
    type Item = { service: string; qty: number; price: number; unit?: string };
    let items: Item[];
    if (Array.isArray(body.line_items)) {
      items = (body.line_items as any[])
        .map((l) => ({ service: String(l?.service ?? "").trim(), qty: Number(l?.qty ?? 1), price: Number(l?.price), unit: l?.unit ? String(l.unit) : undefined }))
        .filter((l) => l.service && Number.isFinite(l.price) && l.price >= 0 && Number.isFinite(l.qty) && l.qty > 0);
    } else {
      const { data: services } = await db.from("services").select("name, base_price, unit").in("slug", body.service_slugs ?? []);
      items = (services ?? []).filter((s) => s.base_price != null).map((s) => ({ service: s.name, qty: 1, price: Number(s.base_price), unit: s.unit ?? undefined }));
    }
    if (!items.length) return NextResponse.json({ error: "Add at least one priced line." }, { status: 400 });
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const { data: quote, error } = await db.from("quotes").insert({ lead_id: body.lead_id, line_items: items, total, status: "draft" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.quote_created", ref_id: quote.id, detail: { by: staff.full_name, total, lines: items.length } });

    if (!body.send) return NextResponse.json({ ok: true, quote_id: quote.id, total, status: "draft" });

    // Send: text the customer from the team, then run the quote_sent stage
    // automation (marks the quote sent, records quote_amount, logs the event).
    const { data: lead } = await db.from("leads").select("id, phone, full_name").eq("id", body.lead_id).maybeSingle();
    if (!lead?.phone) return NextResponse.json({ error: "Lead has no phone to text." }, { status: 400 });
    const { data: thread } = await db.from("threads").select("id").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const message = String(body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Write the text that goes to the customer." }, { status: 400 });
    const sent = await sendSms({ to: lead.phone, message, thread_id: thread?.id ?? null, sender: "staff" });
    const reason = "reason" in sent ? sent.reason : null;
    if (!sent.ok && reason !== "queued_quiet_hours") {
      return NextResponse.json({ error: `Quote saved as a draft — the text did not send (${reason ?? "carrier error"}).`, quote_id: quote.id }, { status: 502 });
    }
    const stage = await runStageAutomation(lead.id, "quote_sent", staff.full_name ?? staff.id);
    await logAutomation({ trigger: "crm.quote_sent", ref_id: quote.id, detail: { by: staff.full_name, total, queued: !sent.ok } });
    return NextResponse.json({ ok: true, quote_id: quote.id, total, status: "sent", queued: !sent.ok, stage });
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

export const POST = withEventLog("POST /api/crm/leads", __POST);
