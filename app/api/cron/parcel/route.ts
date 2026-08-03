import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveAllUnresolvedProperties } from "@/lib/parcel";
import { logAutomation } from "@/lib/automation";
import { suggestCorrections } from "@/lib/addressIntelligence";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hourly self-resolve: any property still missing a verified interior-pin
 * parcel fence (new address, or a stale centroid pin) gets re-resolved with no
 * human action. Wired via pg_cron -> momentum_cron_call('/api/cron/parcel').
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const results = await resolveAllUnresolvedProperties(db);
  const resolved = results.filter((r) => r.matched).length;

  // Anything still unmatched gets reasoned about rather than dropped. A wrong
  // house number or a missing direction prefix is an ordinary typo, and the
  // street itself usually exists — so record what the address probably is and
  // let staff confirm. Only an unmistakable typo, on the right street in the
  // right city, is applied automatically.
  let suggested = 0;
  let autoApplied = 0;
  for (const r of results.filter((x) => !x.matched)) {
    const candidates = await suggestCorrections(r.address, r.city ?? null);
    if (!candidates.length) continue;

    const rows = candidates.map((c) => ({
      property_id: r.id,
      original: r.address,
      original_city: r.city ?? null,
      suggested: c.full_address,
      suggested_city: c.city,
      parcel_id: c.parcel_id,
      lat: c.lat,
      lng: c.lng,
      confidence: c.confidence,
      reason: c.reason,
    }));
    await db.from("address_suggestions").upsert(rows, {
      onConflict: "property_id,suggested",
      ignoreDuplicates: true,
    });
    suggested += rows.length;

    const top = candidates[0];
    const runnerUp = candidates[1];
    // Auto-apply only when the best answer is both confident and clearly the
    // best — two near-equal candidates means it is genuinely ambiguous.
    if (top.auto_applicable && (!runnerUp || top.confidence - runnerUp.confidence >= 10)) {
      await db.from("properties")
        .update({ address: top.full_address, city: top.city })
        .eq("id", r.id);
      await db.from("address_suggestions")
        .update({ status: "accepted", resolved_at: new Date().toISOString() })
        .eq("property_id", r.id).eq("suggested", top.full_address);
      autoApplied += 1;
    }
  }

  await db.rpc("momentum_check_unresolved_addresses");

  await logAutomation({
    trigger: "cron.tracking-parcel",
    detail: {
      total: results.length,
      resolved,
      suggested,
      auto_applied: autoApplied,
      unresolved: results.filter((r) => !r.matched).map((r) => ({ id: r.id, address: r.address })),
    },
  });

  return NextResponse.json({ ok: true, resolved, suggested, auto_applied: autoApplied, total: results.length });
}
