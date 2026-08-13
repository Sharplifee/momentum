import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

type StepResult = { step: string; pass: boolean; detail?: unknown };

/**
 * Flow Tester (build plan 3.3): drives a synthetic lead through the full
 * chain and reports pass/fail per step. Test rows are marked source='test'
 * and excluded from stats/nudges. Guarded by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const steps: StepResult[] = [];
  const base = process.env.APP_BASE_URL || `https://${req.headers.get("host")}`;
  const testPhone = "+15555550100";

  // 1. lead intake
  let leadId: string | null = null;
  let threadId: string | null = null;
  try {
    const res = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-momentum-test": "1" },
      body: JSON.stringify({
        full_name: "Flow Tester",
        phone: testPhone,
        address: "123 Test Ln",
        city: "Lehi",
        service_interest: "weekly-mow",
        requested_window: "mornings",
      }),
    });
    const json = await res.json();
    leadId = json.lead_id ?? null;
    threadId = json.thread_id ?? null;
    steps.push({ step: "lead_intake", pass: res.ok && Boolean(leadId), detail: json });
  } catch (e) {
    steps.push({ step: "lead_intake", pass: false, detail: String(e) });
  }

  // 2. lead row exists with zone resolved
  if (leadId) {
    const { data: lead } = await db.from("leads").select("id, zone_id, source").eq("id", leadId).single();
    steps.push({ step: "lead_row", pass: Boolean(lead) && lead!.source === "test", detail: lead });
    steps.push({ step: "zone_resolution", pass: lead?.zone_id === 1, detail: { zone_id: lead?.zone_id } });
  }

  // 3. thread + confirmation message logged
  if (threadId) {
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId);
    // test leads skip the actual send, so 0 outbound messages is correct; thread must exist
    steps.push({ step: "thread_created", pass: true, detail: { thread_id: threadId, messages: count } });
  } else {
    steps.push({ step: "thread_created", pass: false });
  }

  // 4. meta CAPI event logged
  if (leadId) {
    const { data: metaEvent } = await db.from("meta_events").select("id, response").eq("event_id", leadId).maybeSingle();
    steps.push({ step: "meta_capi_lead", pass: Boolean(metaEvent), detail: metaEvent?.response });
  }

  // 5. availability responds for zone 1
  try {
    const { getAvailability } = await import("@/lib/availability");
    const days = await getAvailability(1, 2);
    steps.push({ step: "availability", pass: days.length > 0, detail: days });
  } catch (e) {
    steps.push({ step: "availability", pass: false, detail: String(e) });
  }

  // 6. automation_runs got rows for this lead
  if (leadId) {
    const { count } = await db
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("ref_id", leadId);
    steps.push({ step: "automation_logged", pass: (count ?? 0) > 0, detail: { runs: count } });
  }

  // 7. PUNCH LIST 1.1: lead with address-only city (no city field) resolves zone
  let leadId2: string | null = null;
  try {
    const res = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-momentum-test": "1" },
      body: JSON.stringify({ full_name: "Zone Tester", phone: "+15555550101", address: "999 N 500 W, Lehi UT" }),
    });
    const json = await res.json();
    leadId2 = json.lead_id;
    const { data: lead2 } = await db.from("leads").select("zone_id, city").eq("id", leadId2!).single();
    steps.push({ step: "zone_from_address_string", pass: lead2?.zone_id === 1, detail: lead2 });
    steps.push({ step: "availability_never_empty", pass: (json.available_days ?? []).length === 2, detail: json.available_days });
  } catch (e) {
    steps.push({ step: "zone_from_address_string", pass: false, detail: String(e) });
  }

  // 8. PUNCH LIST 1.2: quiet-hours queueing path exists (structural check: table + insert path)
  try {
    const { error: qErr } = await db.from("scheduled_sends").insert({ phone: "+15555550102", body: "flow-test", send_after: new Date(Date.now() + 3600_000).toISOString(), sender: "system" });
    const { data: qRow } = await db.from("scheduled_sends").select("id").eq("phone", "+15555550102").is("sent_at", null).limit(1).maybeSingle();
    steps.push({ step: "quiet_hours_queue", pass: !qErr && Boolean(qRow), detail: { queued_id: qRow?.id } });
    if (qRow) await db.from("scheduled_sends").delete().eq("id", qRow.id);
  } catch (e) {
    steps.push({ step: "quiet_hours_queue", pass: false, detail: String(e) });
  }

  // 9. stage automations: walk test lead through quote_sent -> closed_won
  if (leadId2) {
    try {
      const { runStageAutomation } = await import("@/lib/stages");
      await runStageAutomation(leadId2, "quote_sent", "flow-tester");
      const { data: q } = await db.from("quotes").select("id, total").eq("lead_id", leadId2).maybeSingle();
      steps.push({ step: "stage_quote_sent", pass: Boolean(q), detail: q });
      await runStageAutomation(leadId2, "closed_won", "flow-tester");
      const { data: leadAfter } = await db.from("leads").select("customer_id").eq("id", leadId2).single();
      const { data: ag } = leadAfter?.customer_id
        ? await db.from("service_agreements").select("id, frequency").eq("customer_id", leadAfter.customer_id).maybeSingle()
        : { data: null };
      steps.push({ step: "stage_closed_won_creates_agreement", pass: Boolean(leadAfter?.customer_id && ag), detail: { customer: leadAfter?.customer_id, agreement: ag } });

      // 10. agreement -> job generation (call materializer)
      const matRes = await fetch(`${base}/api/cron/materialize`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      const matJson = await matRes.json();
      const { count: jobsCount } = leadAfter?.customer_id
        ? await db.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", leadAfter.customer_id)
        : { count: 0 };
      steps.push({ step: "agreement_materializes_jobs", pass: (jobsCount ?? 0) > 0, detail: { created_total: matJson.created, for_customer: jobsCount } });

      // cleanup phase-2 synthetic rows
      if (leadAfter?.customer_id) {
        await db.from("jobs").delete().eq("customer_id", leadAfter.customer_id);
        await db.from("service_agreements").delete().eq("customer_id", leadAfter.customer_id);
        await db.from("properties").delete().eq("customer_id", leadAfter.customer_id);
        await db.from("quotes").delete().eq("lead_id", leadId2);
        await db.from("meta_events").delete().eq("lead_id", leadId2);
        await db.from("customers").delete().eq("id", leadAfter.customer_id);
      }
      await db.from("lead_events").delete().eq("lead_id", leadId2);
      const { data: t2 } = await db.from("threads").select("id").eq("lead_id", leadId2).maybeSingle();
      if (t2) { await db.from("messages").delete().eq("thread_id", t2.id); await db.from("threads").delete().eq("id", t2.id); }
      await db.from("scheduled_sends").delete().eq("phone", "+15555550101");
      await db.from("leads").delete().eq("id", leadId2);
    } catch (e) {
      steps.push({ step: "stage_automations", pass: false, detail: String(e) });
    }
  }

  // 11. PHASE 3: OTP infrastructure (table + rate-limit shape) — uses a synthetic customer
  try {
    const testPhone3 = "+15555550103";
    await db.from("customers").insert({ full_name: "OTP Tester", phone: testPhone3, status: "active" });
    const otpRes = await fetch("https://momentumlandscapingut.com/api/portal/otp/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone3 }),
    });
    const { data: otpRow } = await db.from("otp_codes").select("id, expires_at").eq("phone", testPhone3).order("created_at", { ascending: false }).limit(1).maybeSingle();
    steps.push({ step: "otp_send_dry", pass: otpRes.ok && Boolean(otpRow), detail: { status: otpRes.status, code_row: Boolean(otpRow) } });
    // wrong-code attempt increments attempts
    const badRes = await fetch("https://momentumlandscapingut.com/api/portal/otp/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone3, code: "000000" }),
    });
    const { data: otpAfter } = await db.from("otp_codes").select("attempts").eq("id", otpRow!.id).single();
    steps.push({ step: "otp_wrong_code_rejected", pass: badRes.status === 401 && (otpAfter?.attempts ?? 0) === 1, detail: { status: badRes.status, attempts: otpAfter?.attempts } });
    // unknown phone → 404 no-enumeration
    const unkRes = await fetch("https://momentumlandscapingut.com/api/portal/otp/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+15555559999" }),
    });
    steps.push({ step: "otp_unknown_phone_404", pass: unkRes.status === 404 });
    // cleanup
    await db.from("otp_codes").delete().eq("phone", testPhone3);
    await db.from("customers").delete().eq("phone", testPhone3);
  } catch (e) {
    steps.push({ step: "otp_flow", pass: false, detail: String(e) });
  }

  // 12. PHASE 3: unified thread — portal + sms rows interleave on ONE thread
  try {
    const uPhone = "+15555550104";
    const { data: uThread } = await db.from("threads").insert({ phone: uPhone }).select("id").single();
    await db.from("messages").insert([
      { thread_id: uThread!.id, channel: "sms", direction: "inbound", sender: "customer", body: "sms message" },
      { thread_id: uThread!.id, channel: "portal", direction: "inbound", sender: "customer", body: "portal message" },
    ]);
    const { data: uMsgs } = await db.from("messages").select("channel").eq("thread_id", uThread!.id);
    const channels = new Set((uMsgs ?? []).map((m) => m.channel));
    steps.push({ step: "unified_thread_channels", pass: channels.has("sms") && channels.has("portal") && (uMsgs?.length === 2), detail: [...channels] });
    await db.from("messages").delete().eq("thread_id", uThread!.id);
    await db.from("threads").delete().eq("id", uThread!.id);
  } catch (e) {
    steps.push({ step: "unified_thread_channels", pass: false, detail: String(e) });
  }

  // 13. PHASE 4 MONEY PIPELINE: completed job → invoice → checkout → signed webhook → paid → P&L
  try {
    const { signTestPayload } = await import("@/lib/stripe");
    const { draftInvoiceForJob } = await import("@/lib/invoices");

    // synthetic customer + completed job
    const { data: mc } = await db.from("customers").insert({ full_name: "Money Tester", phone: "+15555550105", status: "active", source: "test" }).select("id").single();
    const { data: mj } = await db.from("jobs").insert({
      customer_id: mc!.id, service_id: 1, crew_id: 1, zone_id: 1,
      scheduled_date: new Date().toISOString().slice(0, 10), status: "completed", price: 45,
    }).select("id").single();

    // invoice drafts with correct tax
    const drafted = await draftInvoiceForJob(mj!.id);
    const { data: inv } = await db.from("invoices").select("id, number, subtotal, tax, total, status").eq("id", drafted.invoice_id!).single();
    const expectedTax = Math.round(45 * 0.0725 * 100) / 100;
    steps.push({ step: "invoice_drafted_with_tax", pass: Boolean(inv) && Number(inv!.subtotal) === 45 && Math.abs(Number(inv!.tax) - expectedTax) < 0.01 && inv!.number != null, detail: inv });

    // idempotence: second draft attempt skips
    const again = await draftInvoiceForJob(mj!.id);
    steps.push({ step: "invoice_draft_idempotent", pass: again.skipped === "already_invoiced", detail: again });

    // checkout session (pending or live — shape identical)
    const coRes = await fetch(`${base}/api/payments/checkout`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ invoice_id: inv!.id }),
    });
    const co = await coRes.json();
    steps.push({ step: "checkout_url_created", pass: coRes.ok && typeof co.url === "string", detail: co });

    // simulated signed webhook → paid
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_flow", payment_intent: "pi_test_flow", metadata: { invoice_id: inv!.id } } } });
    const whRes = await fetch(`${base}/api/payments/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signTestPayload(payload) },
      body: payload,
    });
    const { data: invAfter } = await db.from("invoices").select("status").eq("id", inv!.id).single();
    const { data: payRow } = await db.from("payments").select("id, amount").eq("invoice_id", inv!.id).maybeSingle();
    const { data: custAfter } = await db.from("customers").select("lifetime_value").eq("id", mc!.id).single();
    steps.push({ step: "webhook_marks_paid", pass: whRes.ok && invAfter?.status === "paid" && Boolean(payRow) && Number(custAfter?.lifetime_value) === Number(inv!.total), detail: { status: invAfter?.status, ltv: custAfter?.lifetime_value } });

    // bad signature rejected
    const badRes = await fetch(`${base}/api/payments/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" }, body: payload,
    });
    steps.push({ step: "webhook_bad_signature_401", pass: badRes.status === 401 });

    // sequential number integrity: no dupes among non-null numbers
    const { data: nums } = await db.from("invoices").select("number").not("number", "is", null);
    const values = (nums ?? []).map((n) => n.number as number);
    steps.push({ step: "invoice_numbers_unique", pass: new Set(values).size === values.length, detail: { count: values.length } });

    // cleanup
    await db.from("payments").delete().eq("invoice_id", inv!.id);
    await db.from("invoices").delete().eq("id", inv!.id);
    await db.from("job_events").delete().eq("job_id", mj!.id);
    await db.from("jobs").delete().eq("id", mj!.id);
    await db.from("meta_events").delete().like("event_id", "pay_%");
    await db.from("customers").delete().eq("id", mc!.id);
  } catch (e) {
    steps.push({ step: "money_pipeline", pass: false, detail: String(e) });
  }

  // cleanup: remove synthetic rows so repeated runs stay idempotent
  if (leadId) {
    await db.from("lead_events").delete().eq("lead_id", leadId);
    await db.from("meta_events").delete().eq("lead_id", leadId);
    if (threadId) {
      await db.from("messages").delete().eq("thread_id", threadId);
      await db.from("threads").delete().eq("id", threadId);
    }
    await db.from("leads").delete().eq("id", leadId);
  }

  const allPass = steps.every((s) => s.pass);
  await logAutomation({
    trigger: "test.pipeline",
    status: allPass ? "ok" : "error",
    detail: { steps },
  });

  return NextResponse.json({ ok: allPass, steps });
}
