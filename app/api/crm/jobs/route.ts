import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/** Job updates from the dispatch board — capacity-checked server-side. */
async function __POST(req: NextRequest) {
  // staff session (browser) OR internal CRON_SECRET (system automations, e.g. weather push-day)
  const internal = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const staff = internal ? { full_name: "system" } : await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body.action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.patch?.crew_id !== undefined) patch.crew_id = body.patch.crew_id;
    if (body.patch?.scheduled_date) {
      const { data: job } = await db.from("jobs").select("crew_id").eq("id", body.job_id).single();
      const crewId = (body.patch.crew_id as number) ?? job?.crew_id;
      if (crewId) {
        const { data: crew } = await db.from("crews").select("max_daily_jobs").eq("id", crewId).single();
        const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("crew_id", crewId).eq("scheduled_date", body.patch.scheduled_date).neq("status", "cancelled");
        if ((count ?? 0) >= (crew?.max_daily_jobs ?? 12)) {
          return NextResponse.json({ error: "day_full" }, { status: 409 });
        }
      }
      patch.scheduled_date = body.patch.scheduled_date;
      patch.weather_flag = false;
    }
    const { error } = await db.from("jobs").update(patch).eq("id", body.job_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("job_events").insert({ job_id: body.job_id, type: "dispatch_edit", note: JSON.stringify(patch), actor: staff.full_name ?? "staff" });
    await logAutomation({ trigger: "crm.job_update", ref_id: body.job_id, detail: patch });
    return NextResponse.json({ ok: true });
  }

  // Capacity check shared by create / reschedule: a crew's day is full at max_daily_jobs.
  async function dayHasRoom(crewId: number | null, date: string, excludeJobId?: string) {
    if (!crewId) return true;
    const { data: crew } = await db.from("crews").select("max_daily_jobs").eq("id", crewId).single();
    let q = db.from("jobs").select("id", { count: "exact", head: true }).eq("crew_id", crewId).eq("scheduled_date", date).neq("status", "cancelled");
    if (excludeJobId) q = q.neq("id", excludeJobId);
    const { count } = await q;
    return (count ?? 0) < (crew?.max_daily_jobs ?? 12);
  }
  const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fmtWin = (s?: string | null, e?: string | null) => {
    const h = (t: string) => { const [hh, mm] = t.split(":").map(Number); const ap = hh >= 12 ? "PM" : "AM"; const h12 = hh % 12 || 12; return mm ? `${h12}:${String(mm).padStart(2, "0")}` : `${h12}`; };
    if (!s) return ""; return e ? `${h(s)}–${h(e)} ${Number(e.slice(0, 2)) >= 12 ? "PM" : "AM"}` : h(s);
  };

  if (body.action === "create") {
    const { customer_id, property_id, service_id, scheduled_date, window_start, window_end, crew_id, repeat_weekly, text_customer } = body;
    if (!customer_id || !property_id || !service_id || !scheduled_date) {
      return NextResponse.json({ error: "customer, property, service and date are required" }, { status: 400 });
    }
    if (!(await dayHasRoom(crew_id ?? null, scheduled_date))) return NextResponse.json({ error: "day_full" }, { status: 409 });
    const [{ data: property }, { data: service }, { data: customer }] = await Promise.all([
      db.from("properties").select("id, zone_id, address").eq("id", property_id).single(),
      db.from("services").select("id, name, base_price, recurring").eq("id", service_id).single(),
      db.from("customers").select("id, full_name, phone").eq("id", customer_id).single(),
    ]);
    if (!property || !service || !customer) return NextResponse.json({ error: "not found" }, { status: 404 });

    let agreementId: string | null = null;
    if (repeat_weekly && service.recurring) {
      const dow = new Date(scheduled_date + "T12:00:00").getDay();
      const { data: ag } = await db.from("service_agreements").insert({
        customer_id, property_id, service_id, frequency: "weekly", day_of_week: dow,
        price_per_visit: service.base_price, season_start: scheduled_date, crew_id: crew_id ?? null, active: true,
      }).select("id").single();
      agreementId = ag?.id ?? null;
    }
    const { data: job, error } = await db.from("jobs").insert({
      customer_id, property_id, service_id, agreement_id: agreementId, crew_id: crew_id ?? null, zone_id: property.zone_id,
      scheduled_date, window_start: window_start ?? null, window_end: window_end ?? null, status: "scheduled",
      price: service.base_price,
    }).select("id").single();
    if (error || !job) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 400 });
    await db.from("job_events").insert({ job_id: job.id, type: "created", note: `${service.name} · ${fmtDay(scheduled_date)} ${fmtWin(window_start, window_end)}`.trim(), actor: staff.full_name ?? "staff" });

    let texted = false;
    if (text_customer && customer.phone) {
      const { sendSms } = await import("@/lib/sms");
      const first = (customer.full_name ?? "").split(" ")[0];
      const r = await sendSms({
        to: customer.phone,
        message: `Momentum Landscaping — ${first ? first + ", " : ""}you're on the schedule for ${service.name.toLowerCase()} ${fmtDay(scheduled_date)}${window_start ? `, ${fmtWin(window_start, window_end)}` : ""}. Reply here if that doesn't work. Reply STOP to opt out.`,
        sender: "system", template: "job_confirmation",
      });
      texted = r.ok;
    }
    await logAutomation({ trigger: "crm.job_create", ref_id: job.id, detail: { customer_id, service_id, scheduled_date, crew_id, repeat_weekly: Boolean(agreementId), texted } });
    return NextResponse.json({ ok: true, job_id: job.id, agreement_id: agreementId, texted });
  }

  if (body.action === "reschedule") {
    const { job_id, scheduled_date, window_start, window_end, reason, text_customer } = body;
    if (!job_id || !scheduled_date) return NextResponse.json({ error: "job_id and scheduled_date required" }, { status: 400 });
    const { data: job } = await db.from("jobs").select("id, crew_id, scheduled_date, window_start, customer_id, services(name), customers(full_name, phone)").eq("id", job_id).single();
    if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!(await dayHasRoom(job.crew_id, scheduled_date, job_id))) return NextResponse.json({ error: "day_full" }, { status: 409 });
    const patch = { scheduled_date, window_start: window_start ?? job.window_start, window_end: window_end ?? null, weather_flag: false, status: "scheduled" as const };
    const { error } = await db.from("jobs").update(patch).eq("id", job_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("job_events").insert({ job_id, type: "rescheduled", note: `${job.scheduled_date} → ${scheduled_date} ${fmtWin(patch.window_start, patch.window_end)}${reason ? ` · ${reason}` : ""}`.trim(), actor: staff.full_name ?? "staff" });

    const cust: any = Array.isArray(job.customers) ? job.customers[0] : job.customers;
    let texted = false;
    if (text_customer && cust?.phone) {
      const { sendSms } = await import("@/lib/sms");
      const first = (cust.full_name ?? "").split(" ")[0];
      const r = await sendSms({
        to: cust.phone,
        message: `Momentum Landscaping — ${first ? first + ", " : ""}your visit moved to ${fmtDay(scheduled_date)}${patch.window_start ? `, ${fmtWin(patch.window_start, patch.window_end)}` : ""}. Reply here if that doesn't work.`,
        sender: "system", template: "job_rescheduled",
      });
      texted = r.ok;
    }
    await logAutomation({ trigger: "crm.job_reschedule", ref_id: job_id, detail: { from: job.scheduled_date, to: scheduled_date, reason, texted } });
    return NextResponse.json({ ok: true, texted });
  }

  if (body.action === "cancel") {
    const { job_id, reason } = body;
    if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });
    const { error } = await db.from("jobs").update({ status: "cancelled" }).eq("id", job_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from("job_events").insert({ job_id, type: "cancelled", note: reason ?? null, actor: staff.full_name ?? "staff" });
    await logAutomation({ trigger: "crm.job_cancel", ref_id: job_id, detail: { reason } });
    return NextResponse.json({ ok: true });
  }

  // Rain hold: move the chosen stops to the next day their crew has room for
  // (never Sunday), clear the flags, and tell the people affected — only if asked.
  if (body.action === "hold_day") {
    const { date, job_ids, text_customers, notify_crew, reason } = body as { date: string; job_ids: string[]; text_customers?: boolean; notify_crew?: boolean; reason?: string };
    if (!date || !Array.isArray(job_ids) || !job_ids.length) return NextResponse.json({ error: "date and job_ids required" }, { status: 400 });
    const { data: jobs } = await db.from("jobs").select("id, crew_id, window_start, window_end, customer_id, services(name), customers(full_name, phone)").in("id", job_ids).eq("scheduled_date", date).neq("status", "cancelled");
    const moved: { id: string; to: string }[] = [];
    const roomCache = new Map<string, number>();
    for (const j of jobs ?? []) {
      let target: string | null = null;
      for (let i = 1; i <= 10 && !target; i++) {
        const d = new Date(new Date(date + "T12:00:00").getTime() + i * 86400_000);
        if (d.getDay() === 0) continue;
        const iso = d.toLocaleDateString("en-CA");
        const key = `${j.crew_id}:${iso}`;
        if (!roomCache.has(key)) {
          const { data: crew } = await db.from("crews").select("max_daily_jobs").eq("id", j.crew_id ?? -1).maybeSingle();
          const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("crew_id", j.crew_id ?? -1).eq("scheduled_date", iso).neq("status", "cancelled");
          roomCache.set(key, (crew?.max_daily_jobs ?? 12) - (count ?? 0));
        }
        if ((roomCache.get(key) ?? 0) > 0) { target = iso; roomCache.set(key, (roomCache.get(key) ?? 0) - 1); }
      }
      if (!target) continue;
      const { error } = await db.from("jobs").update({ scheduled_date: target, weather_flag: false, status: "scheduled" }).eq("id", j.id);
      if (error) continue;
      moved.push({ id: j.id, to: target });
      await db.from("job_events").insert({ job_id: j.id, type: "rain_hold", note: `${date} → ${target}${reason ? ` · ${reason}` : ""}`, actor: staff.full_name ?? "staff" });
      const cust: any = Array.isArray(j.customers) ? j.customers[0] : j.customers;
      if (text_customers && cust?.phone) {
        const { sendSms } = await import("@/lib/sms");
        const first = (cust.full_name ?? "").split(" ")[0];
        await sendSms({ to: cust.phone, sender: "system", template: "rain_hold",
          message: `Momentum Landscaping — ${first ? first + ", " : ""}rain is in the forecast for ${fmtDay(date)}, so we've moved your visit to ${fmtDay(target)}${j.window_start ? `, ${fmtWin(j.window_start, j.window_end)}` : ""}. Reply here if that doesn't work.` });
      }
    }
    if (notify_crew && moved.length) {
      const crewIds = [...new Set((jobs ?? []).map((j) => j.crew_id).filter(Boolean))] as number[];
      const { data: crews } = await db.from("crews").select("id, name, phone").in("id", crewIds);
      const { sendSms } = await import("@/lib/sms");
      for (const c of crews ?? []) {
        if (!c.phone) continue;
        await sendSms({ to: c.phone, sender: "system", bypassQuietHours: true, message: `Momentum — ${fmtDay(date)} is a rain day. ${moved.length} stop${moved.length === 1 ? "" : "s"} moved; the new route is in the app.` });
      }
    }
    await logAutomation({ trigger: "crm.rain_hold", detail: { date, requested: job_ids.length, moved: moved.length, text_customers: Boolean(text_customers), notify_crew: Boolean(notify_crew) } });
    return NextResponse.json({ ok: true, moved });
  }

  if (body.action === "run_anyway") {
    const { date } = body as { date: string };
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
    const { data, error } = await db.from("jobs").update({ weather_flag: false }).eq("scheduled_date", date).eq("weather_flag", true).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.rain_run_anyway", detail: { date, cleared: data?.length ?? 0 } });
    return NextResponse.json({ ok: true, cleared: data?.length ?? 0 });
  }

  if (body.action === "push_day") {
    const zones = (body.zones as number[]) ?? [];
    const date = body.date as string;
    const nextDay = new Date(new Date(date).getTime() + 86400_000).toISOString().slice(0, 10);
    const { data: moved, error } = await db
      .from("jobs")
      .update({ scheduled_date: nextDay, weather_flag: false })
      .eq("scheduled_date", date)
      .in("zone_id", zones)
      .eq("status", "scheduled")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "crm.push_day", detail: { zones, from: date, to: nextDay, moved: moved?.length ?? 0 } });
    return NextResponse.json({ ok: true, moved: moved?.length ?? 0 });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

/** Properties for a customer — the New job sheet needs the address before it can place the visit. */
async function __GET(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data } = await db.from("properties").select("id, address, city, zone_id").eq("customer_id", customerId).order("created_at");
  return NextResponse.json({ properties: data ?? [] });
}

export const GET = withEventLog("GET /api/crm/jobs", __GET);
export const POST = withEventLog("POST /api/crm/jobs", __POST);
