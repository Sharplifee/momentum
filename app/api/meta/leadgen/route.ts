import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GRAPH_VERSION } from "@/lib/meta";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/**
 * Meta lead-ad intake.
 *
 * When someone submits an Instant Form inside Facebook or Instagram, Meta does
 * not send us the answers — it sends a leadgen_id and expects us to go get them.
 * This route does that round trip and then hands the result to /api/leads, so a
 * lead born in an ad walks the exact same path as one from the website: same
 * dedupe, same zone resolution, same Nora confirmation text, same CAPI event,
 * same crew alert. One intake path, not two that drift apart.
 *
 * Config lives in system_config.meta_leadgen rather than env vars so it can be
 * rotated without a redeploy:
 *   { page_access_token, verify_token, app_secret, form_ids: [...] }
 */

type LeadgenConfig = {
  page_access_token?: string;
  verify_token?: string;
  app_secret?: string;
};

async function loadConfig(): Promise<LeadgenConfig> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("system_config")
    .select("value")
    .eq("key", "meta_leadgen")
    .maybeSingle();
  return (data?.value ?? {}) as LeadgenConfig;
}

/* ------------------------------------------------------------------ */
/* GET — Meta's subscription handshake                                 */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;
  const mode = url.get("hub.mode");
  const token = url.get("hub.verify_token");
  const challenge = url.get("hub.challenge");

  const cfg = await loadConfig();

  if (mode === "subscribe" && token && cfg.verify_token && token === cfg.verify_token) {
    // Meta wants the raw challenge back as text/plain, not JSON.
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

/* ------------------------------------------------------------------ */
/* POST — a lead was submitted                                         */
/* ------------------------------------------------------------------ */

function signatureValid(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  const got = header.slice(7);
  // Length check first — timingSafeEqual throws on mismatched buffers.
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

/** Meta's field_data is a list of {name, values[]} — flatten to a plain object. */
function flatten(fieldData: Array<{ name: string; values: string[] }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData ?? []) {
    const v = (f.values ?? []).filter(Boolean).join(" ").trim();
    if (v) out[f.name] = v;
  }
  return out;
}

/**
 * Meta prefixes or renames keys depending on how the question was built, so
 * match on intent rather than an exact key we might not get.
 */
function pick(fields: Record<string, string>, candidates: string[]): string | undefined {
  for (const c of candidates) if (fields[c]) return fields[c];
  const keys = Object.keys(fields);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().includes(c));
    if (hit) return fields[hit];
  }
  return undefined;
}

async function fetchLead(leadgenId: string, token: string) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}` +
    `?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id,platform` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `graph_${res.status}`);
  return json as {
    field_data: Array<{ name: string; values: string[] }>;
    ad_id?: string;
    adset_id?: string;
    campaign_id?: string;
    form_id?: string;
    platform?: string;
    created_time?: string;
  };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cfg = await loadConfig();

  // Anyone can POST to a public URL. Without the signature check this endpoint
  // would happily manufacture leads and fire real texts at real phone numbers.
  if (!cfg.app_secret || !signatureValid(raw, req.headers.get("x-hub-signature-256"), cfg.app_secret)) {
    await logAutomation({ trigger: "meta.leadgen.rejected", status: "error", error: "bad_signature" });
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const body = JSON.parse(raw || "{}");
  const results: Array<Record<string, unknown>> = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "leadgen") continue;
      const leadgenId: string | undefined = change?.value?.leadgen_id;
      if (!leadgenId) continue;

      try {
        if (!cfg.page_access_token) throw new Error("no_page_access_token");
        const lead = await fetchLead(leadgenId, cfg.page_access_token);
        const fields = flatten(lead.field_data);

        const full_name =
          pick(fields, ["full_name", "name"]) ??
          [pick(fields, ["first_name"]), pick(fields, ["last_name"])].filter(Boolean).join(" ").trim();
        const phone = pick(fields, ["phone_number", "phone"]);
        const address = pick(fields, ["address", "street"]);
        const requested_window = pick(fields, ["requested_window", "window", "time"]);
        const email = pick(fields, ["email"]);

        if (!full_name || !phone || !address) {
          await logAutomation({
            trigger: "meta.leadgen.incomplete",
            ref_id: leadgenId,
            status: "error",
            detail: { fields },
          });
          results.push({ leadgen_id: leadgenId, ok: false, reason: "missing_required_fields" });
          continue;
        }

        // Hand off to the one true intake path. CRON_SECRET marks it internal so
        // the public rate limiter doesn't throttle a campaign that's working.
        const base = process.env.APP_BASE_URL ?? `https://${req.headers.get("host")}`;
        const res = await fetch(`${base}/api/leads`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.CRON_SECRET}`,
            "x-momentum-source": "meta_lead_ad",
          },
          body: JSON.stringify({
            full_name,
            phone,
            address,
            email: email ?? undefined,
            requested_window,
            utm: {
              source: "meta",
              medium: "paid_social",
              campaign: lead.campaign_id,
              content: lead.ad_id,
              term: lead.adset_id,
            },
            landing_page: `meta:${lead.platform ?? "facebook"}/form/${lead.form_id ?? "unknown"}`,
            referrer: "meta_lead_ad",
          }),
        });

        const out = await res.json().catch(() => ({}));
        results.push({ leadgen_id: leadgenId, ok: res.ok, lead_id: out?.lead_id });

        await logAutomation({
          trigger: "meta.leadgen.received",
          ref_id: out?.lead_id ?? leadgenId,
          status: res.ok ? "ok" : "error",
          detail: {
            leadgen_id: leadgenId,
            form_id: lead.form_id,
            ad_id: lead.ad_id,
            campaign_id: lead.campaign_id,
            platform: lead.platform,
          },
        });
      } catch (err) {
        await logAutomation({
          trigger: "meta.leadgen.error",
          ref_id: leadgenId,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({ leadgen_id: leadgenId, ok: false });
      }
    }
  }

  // Always 200. A non-2xx makes Meta retry the same lead for days, and a lead
  // we already texted must not be texted again.
  return NextResponse.json({ ok: true, processed: results.length, results });
}
