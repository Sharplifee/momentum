import { NextRequest, NextResponse } from "next/server";
import { GRAPH_VERSION } from "@/lib/meta";
import { fetchMetaLead, ingestMetaLead, loadLeadgenConfig } from "@/lib/metaLeadIntake";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_ID = "565418916665337";

/**
 * Safety net for the leadgen webhook: every 5 minutes, pull recent leads from
 * every ACTIVE instant form on the Page and ingest any the CRM doesn't have.
 * Works with the page token's leads_retrieval permission alone, so leads land
 * even when the Page→app webhook subscription is missing or Meta drops a delivery.
 * ?backfill=1&since=<unix> ingests without texting (for old leads).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = await loadLeadgenConfig();
  const token = cfg.page_access_token;
  if (!token) return NextResponse.json({ error: "no_page_token" }, { status: 500 });

  const sp = req.nextUrl.searchParams;
  const backfill = sp.get("backfill") === "1";
  const since = Number(sp.get("since") ?? Math.floor(Date.now() / 1000) - 3 * 86400);
  const base = process.env.APP_BASE_URL ?? `https://${req.headers.get("host")}`;

  const formsRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.page_id ?? PAGE_ID}/leadgen_forms?fields=id,status&limit=100&access_token=${token}`,
    { cache: "no-store" }
  );
  const forms = await formsRes.json();
  if (!formsRes.ok) {
    await logAutomation({ trigger: "meta.poll.forms", status: "error", error: JSON.stringify(forms?.error ?? forms) });
    return NextResponse.json({ error: "forms_fetch_failed", detail: forms?.error }, { status: 502 });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const f of forms.data ?? []) {
    if (f.status !== "ACTIVE" && !backfill) continue;
    const filtering = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]));
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${f.id}/leads?fields=id&limit=100&filtering=${filtering}&access_token=${token}`,
      { cache: "no-store" }
    );
    const body = await r.json();
    for (const l of body.data ?? []) {
      try {
        const full = await fetchMetaLead(l.id, token);
        const out = await ingestMetaLead(full, { base, backfill, via: backfill ? "backfill" : "poll" });
        results.push({ leadgen_id: l.id, form_id: f.id, ...out });
      } catch (e) {
        results.push({ leadgen_id: l.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  const created = results.filter((r) => r.ok && !r.skipped).length;
  if (created) await logAutomation({ trigger: "meta.poll.ingested", status: "ok", detail: { created, backfill } });
  return NextResponse.json({ ok: true, checked: results.length, created, results });
}
