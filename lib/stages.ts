import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { sendMetaCapiEvent } from "@/lib/meta";
import { getAvailability } from "@/lib/availability";
import { logAutomation } from "@/lib/automation";
import { pricingModifiers } from "@/lib/pricing";

/**
 * Stage automations A3–A6 (build plan 3.4). Idempotent: each transition
 * checks for its own prior side-effects before creating anything.
 */
export async function runStageAutomation(leadId: string, newStage: string, actor: string) {
  const db = supabaseAdmin();
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).single();
  if (!lead) return { ok: false, error: "lead not found" };

  await db.from("leads").update({ stage: newStage, last_contact_at: new Date().toISOString() }).eq("id", leadId);
  await db.from("lead_events").insert({ lead_id: leadId, type: "stage_change", detail: { to: newStage }, actor });

  if (newStage === "contacted") {
    if (!lead.first_response_at) {
      const respSeconds = Math.round((Date.now() - new Date(lead.created_at).getTime()) / 1000);
      await db.from("leads").update({ first_response_at: new Date().toISOString(), response_time_seconds: respSeconds }).eq("id", leadId);
    } else if (lead.response_time_seconds == null) {
      const respSeconds = Math.round((new Date(lead.first_response_at).getTime() - new Date(lead.created_at).getTime()) / 1000);
      await db.from("leads").update({ response_time_seconds: respSeconds }).eq("id", leadId);
    }
  }

  if (newStage === "quote_sent") {
    // attach/create quote
    let { data: quote } = await db.from("quotes").select("id, total").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!quote) {
      const { data: svc } = await db.from("services").select("id, name, base_price").eq("slug", lead.service_interest ?? "weekly-mow").maybeSingle();
      const price = svc?.base_price ?? 45;
      const { data: created } = await db
        .from("quotes")
        .insert({ lead_id: leadId, line_items: [{ service: svc?.name ?? "Weekly Lawn Maintenance", qty: 1, price }], total: price, status: "sent", sent_at: new Date().toISOString() })
        .select("id, total")
        .single();
      quote = created;
    } else {
      await db.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quote.id);
    }
    await db.from("leads").update({ quote_amount: quote?.total ?? null }).eq("id", leadId);

    // auto-schedule proposal
    const days = await getAvailability(lead.zone_id, 1);
    if (days[0]) {
      await db.from("leads").update({ proposed_date: days[0].date, proposed_crew_id: days[0].crew_id }).eq("id", leadId);
    }

    await sendMetaCapiEvent({
      event_name: "InitiateCheckout",
      event_id: `ic-${leadId}`,
      phone: lead.phone, email: lead.email,
      lead_id: leadId, action_source: "system_generated",
      value: Number(quote?.total ?? 0),
    });
  }

  if (newStage === "closed_won") {
    // idempotent: reuse linked customer if present
    let customerId = lead.customer_id as string | null;
    if (!customerId) {
      const { data: existingC } = await db.from("customers").select("id").eq("phone", lead.phone).maybeSingle();
      if (existingC) customerId = existingC.id;
    }
    if (!customerId) {
      const { data: c } = await db
        .from("customers")
        .insert({ full_name: lead.full_name ?? "Customer", phone: lead.phone, email: lead.email, source: lead.source, status: "active" })
        .select("id").single();
      customerId = c!.id;
    }
    await db.from("leads").update({ customer_id: customerId }).eq("id", leadId);

    // property — carries the on-site personal-quote checklist over from the lead
    let { data: property } = await db.from("properties").select("id, has_dog, gate_width_in, obstacles, watering_day, bags_clippings, premium_handling, haul_clippings").eq("customer_id", customerId).eq("address", lead.address ?? "").maybeSingle();
    if (!property && lead.address) {
      const { data: p } = await db
        .from("properties")
        .insert({
          customer_id: customerId, address: lead.address, city: lead.city, zone_id: lead.zone_id,
          has_dog: lead.has_dog ?? false, gate_width_in: lead.gate_width_in ?? null,
          obstacles: lead.obstacles ?? [], watering_day: lead.watering_day ?? null,
          bags_clippings: lead.bags_clippings ?? false, premium_handling: lead.premium_handling ?? false,
          haul_clippings: lead.haul_clippings ?? false,
        })
        .select("id, has_dog, gate_width_in, obstacles, watering_day, bags_clippings, premium_handling, haul_clippings").single();
      property = p;
    }

    // agreement (recurring) or one-off job — base price plus any on-site checklist modifiers
    const { data: quote } = await db.from("quotes").select("id, total, line_items").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: svc } = await db.from("services").select("id, recurring, base_price").eq("slug", lead.service_interest ?? "weekly-mow").maybeSingle();
    const basePrice = quote?.total ?? svc?.base_price ?? 45;
    const modifiers = property ? await pricingModifiers(db, property) : [];
    const modifierTotal = modifiers.filter((m) => !m.blocked).reduce((s, m) => s + m.price, 0);
    const price = basePrice + modifierTotal;
    if (quote && modifiers.length) {
      await db.from("quotes").update({
        line_items: [...(quote.line_items ?? []), ...modifiers.filter((m) => !m.blocked).map((m) => ({ service: m.label, qty: 1, price: m.price }))],
        total: price,
      }).eq("id", quote.id);
    }

    const { data: existingAg } = await db.from("service_agreements").select("id").eq("customer_id", customerId).eq("active", true).maybeSingle();
    if (!existingAg) {
      if (svc?.recurring !== false) {
        const freq = lead.service_interest === "biweekly-mow" ? "biweekly" : "weekly";
        const { data: crew } = lead.zone_id
          ? await db.from("crews").select("id").eq("home_zone", lead.zone_id).eq("active", true).limit(1).maybeSingle()
          : { data: null };
        await db.from("service_agreements").insert({
          customer_id: customerId, property_id: property?.id ?? null,
          service_id: svc?.id ?? 1, frequency: freq, price_per_visit: price,
          crew_id: crew?.id ?? null, day_of_week: 5, active: true,
        });
      } else if (lead.proposed_date) {
        await db.from("jobs").insert({
          customer_id: customerId, property_id: property?.id ?? null, service_id: svc?.id ?? null,
          crew_id: lead.proposed_crew_id, zone_id: lead.zone_id,
          scheduled_date: lead.proposed_date, status: "scheduled", price,
        });
      }
    }
    if (quote) await db.from("quotes").update({ status: "accepted", accepted_at: new Date().toISOString(), customer_id: customerId }).eq("id", quote.id);

    await sendMetaCapiEvent({
      event_name: "Purchase",
      event_id: `won-${leadId}`,
      phone: lead.phone, email: lead.email,
      lead_id: leadId, action_source: "system_generated",
      value: Number(price),
    });

    await sendSms({
      to: lead.phone,
      message: `Welcome to Momentum, ${(lead.full_name ?? "friend").split(" ")[0]}! 🌱 You're on the schedule — you'll get a text the evening before each visit. Reply here anytime.`,
      sender: "nora",
    });
    await sendSms({
      to: "+13853076535",
      message: `🎉 Closed won: ${lead.full_name} (${lead.city ?? "?"}) — $${price}/visit.`,
      sender: "system", bypassQuietHours: true,
    });
  }

  if (newStage === "not_qualified") {
    const { data: alreadyClosed } = await db.from("lead_events").select("id").eq("lead_id", leadId).eq("type", "polite_close_sent").maybeSingle();
    if (!alreadyClosed) {
      await sendSms({
        to: lead.phone,
        message: `Thanks for reaching out to Momentum Landscaping! We're not able to take this one on right now, but we'd love to help in the future. 🌱`,
        sender: "nora",
      });
      await db.from("lead_events").insert({ lead_id: leadId, type: "polite_close_sent", actor: "system" });
    }
    const { data: thread } = await db.from("threads").select("id").eq("lead_id", leadId).maybeSingle();
    if (thread) await db.from("threads").update({ escalated: false }).eq("id", thread.id);
  }

  await logAutomation({ trigger: `stage.${newStage}`, ref_id: leadId, detail: { actor } });
  return { ok: true };
}
