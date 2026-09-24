import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";
import { fetchMetaLead, ingestMetaLead } from "@/lib/metaLeadIntake";

export const runtime = "nodejs";

/**
 * Meta lead-ad intake.
 *
 * When someone submits an Instant Form inside Facebook or Instagram, Meta does
 * not send us the answers — it sends a leadgen_id and expects us to go get them.
 * This route does that round trip and then hands the result to /api/leads, so a
 * lead born in an ad walks the exact same path as one from the website: same
 * dedupe, same zone resolution, same Norma confirmation text, same CAPI event,
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
        if (!cfg.page_access_token) throw new Error("no_page_access_token");
        const lead = await fetchMetaLead(leadgenId, cfg.page_access_token);
        const base = process.env.APP_BASE_URL ?? `https://${req.headers.get("host")}`;
        const r = await ingestMetaLead(lead, { base, via: "webhook" });
        results.push({ leadgen_id: leadgenId, ok: r.ok, lead_id: r.lead_id, reason: r.skipped });
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
