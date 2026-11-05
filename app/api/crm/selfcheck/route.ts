import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent, withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Live self-check: proves the CRM works end to end, as the owner would see it,
 * from inside the deployment — no laptop, no password.
 *
 *   1. Data: the tables a screen depends on have rows; the crons have run.
 *   2. Session: the owner's account gets a short-lived session minted with the
 *      service role (admin generateLink → verifyOtp), never a password.
 *   3. Screens: every CRM page is fetched with that session; each must answer
 *      200 (not bounce to /crm/login), carry a marker that proves it rendered
 *      its data, and contain no Next.js error page.
 *   4. The session is revoked again.
 *
 * Guarded by CRON_SECRET so the database's own cron caller can trigger it
 * (`select public.momentum_cron_call('/api/crm/selfcheck')`) and the result
 * lands in event_log as `selfcheck`. Nothing is written to business tables.
 */
type Check = { name: string; ok: boolean; ms?: number; detail?: unknown };

async function __GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const db = supabaseAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const base = (process.env.APP_BASE_URL || `https://${req.headers.get("host")}`).replace(/\/$/, "");
  const checks: Check[] = [];
  const t0 = () => Date.now();

  // ---- 1. data -------------------------------------------------------------
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const weekEnd = new Date(Date.now() + 7 * 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const [{ count: customers }, { count: properties }, { count: agreements }, { data: jobs }, { data: owner }, { data: crons }] = await Promise.all([
    db.from("customers").select("id", { count: "exact", head: true }).neq("status", "opted_out"),
    db.from("properties").select("id", { count: "exact", head: true }),
    db.from("service_agreements").select("id", { count: "exact", head: true }).eq("active", true),
    db.from("jobs").select("id, scheduled_date, customer_id, customers(full_name)").gte("scheduled_date", todayIso).lte("scheduled_date", weekEnd).neq("status", "cancelled").order("scheduled_date").limit(20),
    db.from("profiles").select("id, email, full_name, role").eq("role", "owner").order("created_at").limit(1).maybeSingle(),
    // automation_runs is written by the cron handlers themselves (inside the
    // request), so it is the record of what ran; event_log is the HTTP trace.
    db.from("automation_runs").select("trigger, status, created_at").like("trigger", "cron.%").gte("created_at", new Date(Date.now() - 36 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(400),
  ]);
  const lastCron = new Map<string, { status: string; ts: string }>();
  for (const c of (crons ?? []) as any[]) if (!lastCron.has(c.trigger)) lastCron.set(c.trigger, { status: c.status, ts: c.created_at });
  const cronView = Object.fromEntries([...lastCron].map(([k, v]) => [k.replace("cron.", ""), `${v.status} · ${v.ts}`]));
  checks.push({ name: "db.customers", ok: (customers ?? 0) > 0, detail: customers });
  checks.push({ name: "db.properties", ok: (properties ?? 0) > 0, detail: properties });
  checks.push({ name: "db.agreements_active", ok: (agreements ?? 0) > 0, detail: agreements });
  checks.push({ name: "db.jobs_next_7d", ok: (jobs ?? []).length > 0, detail: (jobs ?? []).map((j: any) => `${j.scheduled_date} ${j.customers?.full_name ?? ""}`) });
  const mat = lastCron.get("cron.materialize");
  checks.push({ name: "cron.materialize_ran_24h", ok: /ok/.test(mat?.status ?? "") && Date.now() - new Date(mat?.ts ?? 0).getTime() < 26 * 3600_000, detail: cronView });
  if (!owner?.email) {
    checks.push({ name: "owner.profile", ok: false, detail: "no owner profile with an email" });
    return finish(checks, started, null);
  }
  checks.push({ name: "owner.profile", ok: true, detail: owner.full_name });

  // ---- 2. session ----------------------------------------------------------
  const sessionT = t0();
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email: owner.email });
  if (linkErr || !link?.properties?.hashed_token) {
    checks.push({ name: "session.mint", ok: false, detail: linkErr?.message ?? "no token" });
    return finish(checks, started, owner.id);
  }
  const plain = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: vErr } = await plain.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr || !verified.session) {
    checks.push({ name: "session.mint", ok: false, detail: vErr?.message ?? "no session" });
    return finish(checks, started, owner.id);
  }
  const session = verified.session;
  // Let @supabase/ssr write the cookies in exactly the shape the middleware reads.
  const jar = new Map<string, string>();
  const ssr = createServerClient(url, anon, {
    cookies: {
      get: (n: string) => jar.get(n),
      set: (n: string, v: string) => { jar.set(n, v); },
      remove: (n: string) => { jar.delete(n); },
    },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const cookie = [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  checks.push({ name: "session.mint", ok: jar.size > 0, ms: t0() - sessionT, detail: `${jar.size} cookie part(s)` });

  // ---- 3. screens ----------------------------------------------------------
  const firstJob = (jobs ?? [])[0] as any;
  const { data: michael } = await db.from("customers").select("id").eq("full_name", "Michael Johnson").maybeSingle();
  const anyCustomer = michael?.id ?? firstJob?.customer_id ?? null;
  const screens: { path: string; marker: RegExp }[] = [
    { path: "/crm", marker: /This week/ },
    { path: "/crm/schedule", marker: /Schedule/ },
    { path: "/crm/tracker", marker: /Tracker/ },
    { path: "/crm/leads", marker: /Leads/ },
    { path: "/crm/messages", marker: /Norma/ },
    { path: "/crm/more", marker: /Customers/ },
    { path: "/crm/customers", marker: new RegExp(String(customers ?? 0) === "0" ? "Customers" : "Michael Johnson") },
    ...(anyCustomer ? [{ path: `/crm/customers/${anyCustomer}`, marker: michael ? /No phone on file|\(\d{3}\) \d{3}-\d{4}/ : /Visits/ }] : []),
    ...(firstJob ? [{ path: `/crm/jobs/${firstJob.id}`, marker: new RegExp((firstJob.customers?.full_name ?? "Visit").split(" ")[0]) }] : []),
    { path: "/crm/notifications", marker: /Notifications/ },
    { path: "/crm/accounting", marker: /Accounting|Money/ },
    { path: "/crm/expenses", marker: /Expenses/ },
    { path: "/crm/settings", marker: /Settings/ },
    { path: "/crm/account", marker: /Account/ },
  ];
  for (const s of screens) {
    const t = t0();
    try {
      const r = await fetch(`${base}${s.path}`, { headers: { cookie, "user-agent": "momentum-selfcheck" }, redirect: "manual", cache: "no-store" });
      const html = r.status === 200 ? await r.text() : "";
      // Markers must be in the HTML a browser paints, not merely in the RSC
      // payload inside <script> tags — a page that ships an empty body and
      // renders itself later with JavaScript does not count as rendered.
      const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
      const errorPage = /Application error|Something went wrong|__next_error__/.test(html);
      const ok = r.status === 200 && s.marker.test(visible) && !errorPage;
      const headings = ok ? undefined : [...visible.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/g)].map((m) => m[1].replace(/<[^>]+>/g, "")).slice(0, 8);
      checks.push({ name: `screen ${s.path.replace(/\/[0-9a-f-]{36}$/, "/[id]")}`, ok, ms: t0() - t, detail: ok ? `${html.length} chars` : { status: r.status, location: r.headers.get("location"), marker: s.marker.source, errorPage, bytes: html.length, streamed: html.includes("__next_f"), headings, tail: html.slice(-400).replace(/\s+/g, " ") } });
    } catch (e) {
      checks.push({ name: `screen ${s.path}`, ok: false, ms: t0() - t, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  // APIs the shell polls
  for (const p of ["/api/crm/status", anyCustomer ? `/api/crm/customers?customer_id=${anyCustomer}` : null].filter(Boolean) as string[]) {
    const t = t0();
    try {
      const r = await fetch(`${base}${p}`, { headers: { cookie }, cache: "no-store" });
      const j = await r.json().catch(() => null);
      checks.push({ name: `api ${p.split("?")[0]}`, ok: r.status === 200 && !!j, ms: t0() - t, detail: r.status === 200 ? Object.keys(j ?? {}).slice(0, 8) : r.status });
    } catch (e) {
      checks.push({ name: `api ${p}`, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---- 4. revoke -----------------------------------------------------------
  const { error: outErr } = await db.auth.admin.signOut(session.access_token, "local");
  checks.push({ name: "session.revoked", ok: !outErr, detail: outErr?.message });

  return finish(checks, started, owner.id);
}

async function finish(checks: Check[], started: number, actor: string | null) {
  const failed = checks.filter((c) => !c.ok);
  const result = { ok: failed.length === 0, ms: Date.now() - started, passed: checks.length - failed.length, failed: failed.length, checks };
  await logEvent({ surface: "backend", event_type: "system", name: "selfcheck", status: result.ok ? "ok" : "fail", actor_type: "service", actor_id: actor, duration_ms: result.ms, payload: result });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export const GET = withEventLog("GET /api/crm/selfcheck", __GET);
