import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/* ---------- field whitelists: the settings screens may touch these columns and nothing else ---------- */
const SERVICE_FIELDS = ["name", "slug", "description", "base_price", "unit", "duration_min", "recurring", "active"] as const;
const ZONE_FIELDS = ["name", "cities", "notes", "active"] as const;
const CREW_FIELDS = ["name", "lead_profile", "home_zone", "max_daily_jobs", "max_weekly_clients", "phone", "notes", "active"] as const;
const TEMPLATE_FIELDS = ["body", "delay_minutes", "active"] as const;
/** system_config keys the Norma / alerts screens may edit. Everything else stays read-only here. */
const CONFIG_KEYS = ["quiet_hours", "business_hours", "season"] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function pick<T extends readonly string[]>(src: Record<string, unknown>, fields: T) {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in src) out[f] = src[f];
  return out;
}
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

/** Normalise a service patch; returns an error string when a value cannot be stored. */
function serviceClean(p: Record<string, unknown>): Record<string, unknown> | string {
  const o = pick(p, SERVICE_FIELDS);
  if ("name" in o) { o.name = String(o.name ?? "").trim(); if (!o.name) return "name is required"; }
  if ("slug" in o) { o.slug = slugify(String(o.slug ?? "")); if (!o.slug) return "slug is required"; }
  if ("description" in o) o.description = String(o.description ?? "").trim() || null;
  if ("base_price" in o) {
    const v = o.base_price === null || o.base_price === "" ? null : Number(o.base_price);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return "base price must be a number";
    o.base_price = v;
  }
  if ("unit" in o) o.unit = String(o.unit ?? "").trim() || null;
  if ("duration_min" in o) {
    const v = o.duration_min === null || o.duration_min === "" ? null : Math.round(Number(o.duration_min));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return "duration must be whole minutes";
    o.duration_min = v;
  }
  if ("recurring" in o) o.recurring = Boolean(o.recurring);
  if ("active" in o) o.active = Boolean(o.active);
  return o;
}

function zoneClean(p: Record<string, unknown>): Record<string, unknown> | string {
  const o = pick(p, ZONE_FIELDS);
  if ("name" in o) { o.name = String(o.name ?? "").trim(); if (!o.name) return "name is required"; }
  if ("cities" in o) {
    const raw = Array.isArray(o.cities) ? o.cities : String(o.cities ?? "").split(",");
    o.cities = raw.map((c) => String(c).trim()).filter(Boolean);
  }
  if ("notes" in o) o.notes = String(o.notes ?? "").trim() || null;
  if ("active" in o) o.active = Boolean(o.active);
  return o;
}

function crewClean(p: Record<string, unknown>): Record<string, unknown> | string {
  const o = pick(p, CREW_FIELDS);
  if ("name" in o) { o.name = String(o.name ?? "").trim(); if (!o.name) return "name is required"; }
  if ("lead_profile" in o) o.lead_profile = o.lead_profile ? String(o.lead_profile) : null;
  if ("home_zone" in o) { const v = o.home_zone === null || o.home_zone === "" ? null : Number(o.home_zone); if (v !== null && !Number.isInteger(v)) return "home zone must be a zone id"; o.home_zone = v; }
  for (const k of ["max_daily_jobs", "max_weekly_clients"] as const) {
    if (k in o) { const v = o[k] === null || o[k] === "" ? null : Math.round(Number(o[k])); if (v !== null && (!Number.isFinite(v) || v < 0)) return `${k.replace(/_/g, " ")} must be a whole number`; o[k] = v; }
  }
  if ("phone" in o) o.phone = String(o.phone ?? "").trim() || null;
  if ("notes" in o) o.notes = String(o.notes ?? "").trim() || null;
  if ("active" in o) o.active = Boolean(o.active);
  return o;
}

function templateClean(p: Record<string, unknown>): Record<string, unknown> | string {
  const o = pick(p, TEMPLATE_FIELDS);
  if ("body" in o) { o.body = String(o.body ?? "").trim(); if (!o.body) return "the message cannot be empty"; }
  if ("delay_minutes" in o) { const v = o.delay_minutes === null || o.delay_minutes === "" ? null : Math.round(Number(o.delay_minutes)); if (v !== null && (!Number.isFinite(v) || v < 0)) return "delay must be whole minutes"; o.delay_minutes = v; }
  if ("active" in o) o.active = Boolean(o.active);
  return o;
}

/** Each editable config key has a fixed shape; a write that does not fit is refused rather than stored. */
function configClean(key: string, value: unknown): Record<string, unknown> | string {
  const v = (value ?? {}) as Record<string, unknown>;
  if (key === "quiet_hours") {
    const a = String(v.no_sends_before ?? ""), b = String(v.no_sends_after ?? "");
    if (!HHMM.test(a) || !HHMM.test(b)) return "quiet hours need HH:MM times";
    if (a >= b) return "quiet hours must end in the morning and start in the evening";
    return { no_sends_before: a, no_sends_after: b };
  }
  if (key === "business_hours") {
    const a = String(v.start ?? ""), b = String(v.end ?? "");
    if (!HHMM.test(a) || !HHMM.test(b) || a >= b) return "business hours need HH:MM start before end";
    return { tz: "America/Denver", start: a, end: b };
  }
  if (key === "season") {
    const a = String(v.start ?? ""), b = String(v.end ?? "");
    if (!MMDD.test(a) || !MMDD.test(b)) return "season needs MM-DD dates";
    return { start: a, end: b };
  }
  return "that setting is not editable here";
}

async function __POST(req: NextRequest) {
  const staff = await staffFromSession(["owner"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { kind, payload } = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const p = (payload ?? {}) as Record<string, any>;
  let result: unknown = null;

  /* ---- original actions, unchanged ---- */
  if (kind === "service_price") await db.from("services").update({ base_price: p.base_price }).eq("id", p.id);
  else if (kind === "service_active") await db.from("services").update({ active: p.active }).eq("id", p.id);
  else if (kind === "template") await db.from("sms_templates").update({ body: p.body }).eq("id", p.id);
  else if (kind === "alerts_mode") {
    const { data: cfg } = await db.from("system_config").select("value").eq("key", "team_alerts").single();
    await db.from("system_config").update({ value: { ...(cfg?.value as object), mode: p.mode }, updated_at: new Date().toISOString() }).eq("key", "team_alerts");
  }

  /* ---- services ---- */
  else if (kind === "service_update") {
    if (!p.id) return bad("id is required");
    const patch = serviceClean(p); if (typeof patch === "string") return bad(patch);
    const { error } = await db.from("services").update(patch).eq("id", p.id);
    if (error) return bad(error.message);
  } else if (kind === "service_create") {
    const patch = serviceClean({ active: true, recurring: false, ...p, slug: p.slug || p.name }); if (typeof patch === "string") return bad(patch);
    if (!patch.name) return bad("name is required");
    const { data, error } = await db.from("services").insert(patch).select("id").single();
    if (error) return bad(error.message);
    result = data;
  }

  /* ---- zones ---- */
  else if (kind === "zone_update") {
    if (!p.id) return bad("id is required");
    const patch = zoneClean(p); if (typeof patch === "string") return bad(patch);
    const { error } = await db.from("zones").update(patch).eq("id", p.id);
    if (error) return bad(error.message);
  } else if (kind === "zone_create") {
    const patch = zoneClean({ active: true, cities: [], ...p }); if (typeof patch === "string") return bad(patch);
    if (!patch.name) return bad("name is required");
    const { data, error } = await db.from("zones").insert(patch).select("id").single();
    if (error) return bad(error.message);
    result = data;
  }

  /* ---- crews ---- */
  else if (kind === "crew_update") {
    if (!p.id) return bad("id is required");
    const patch = crewClean(p); if (typeof patch === "string") return bad(patch);
    const { error } = await db.from("crews").update(patch).eq("id", p.id);
    if (error) return bad(error.message);
  } else if (kind === "crew_create") {
    const patch = crewClean({ active: true, ...p }); if (typeof patch === "string") return bad(patch);
    if (!patch.name) return bad("name is required");
    const { data, error } = await db.from("crews").insert(patch).select("id").single();
    if (error) return bad(error.message);
    result = data;
  }

  /* ---- SMS templates: body plus delay and active ---- */
  else if (kind === "template_update") {
    if (!p.id) return bad("id is required");
    const patch = templateClean(p); if (typeof patch === "string") return bad(patch);
    const { error } = await db.from("sms_templates").update(patch).eq("id", p.id);
    if (error) return bad(error.message);
  }

  /* ---- team alert recipients: the list the current mode reads ---- */
  else if (kind === "alerts_recipients") {
    const phones = Array.isArray(p.phones) ? p.phones.map((x: unknown) => String(x).trim()).filter((x: string) => /^\+1\d{10}$/.test(x)) : null;
    if (!phones) return bad("phones must be a list of +1 numbers");
    const { data: cfg } = await db.from("system_config").select("value").eq("key", "team_alerts").single();
    const cur = (cfg?.value ?? {}) as Record<string, unknown>;
    const listKey = cur.mode === "launch" ? "launch_recipients" : "recipients";
    await db.from("system_config").update({ value: { ...cur, [listKey]: phones }, updated_at: new Date().toISOString() }).eq("key", "team_alerts");
  }

  /* ---- Norma rules: a few whitelisted system_config keys ---- */
  else if (kind === "config_update") {
    const key = String(p.key ?? "");
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) return bad("that setting is not editable here");
    const value = configClean(key, p.value); if (typeof value === "string") return bad(value);
    const { error } = await db.from("system_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return bad(error.message);
  }

  // NOTE: sms_sandbox has NO write path here on purpose — Connor's explicit word required.
  else return NextResponse.json({ error: "unknown kind" }, { status: 400 });

  await logAutomation({ trigger: "crm.settings", detail: { kind, payload, by: staff.full_name } });
  return NextResponse.json({ ok: true, ...(result ? { result } : {}) });
}

export const POST = withEventLog("POST /api/crm/settings", __POST);
