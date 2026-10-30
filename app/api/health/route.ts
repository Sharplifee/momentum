import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Health has to fail when the system is actually broken. The old version only
 * checked that keys were SET, so it reported anthropic ok for 9 weeks while
 * every real call was rejected for a zero credit balance and Norma answered
 * nobody. Presence of a key is not health — reachability is. Anthropic is
 * probed with a 1-token message (cheap, and it is the exact call Norma makes);
 * Pingram with a GET on its account endpoint (no send, no cost).
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function __GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    const db = supabaseAdmin();
    const { error } = await db.from("system_config").select("key").limit(1);
    checks.db = { ok: !error, detail: error?.message };
  } catch (e) {
    checks.db = { ok: false, detail: String(e) };
  }

  // Pingram: real auth check against the account endpoint. Also surfaces the
  // spend cap, which is what silently discarded ~200 messages in August.
  // The dedicated number was released 2026-08-03; sends go out on Pingram's
  // shared number, so PINGRAM_FROM_NUMBER is no longer a requirement.
  const pingramKey = process.env.PINGRAM_API_KEY;
  if (!pingramKey) {
    checks.pingram = { ok: false, detail: "PINGRAM_API_KEY not set" };
  } else {
    try {
      const h = { authorization: `Bearer ${pingramKey}` };
      const [r, u] = await withTimeout(
        Promise.all([
          fetch("https://api.pingram.io/account", { headers: h, cache: "no-store" }),
          fetch("https://api.pingram.io/account/usage", { headers: h, cache: "no-store" }),
        ]),
        8000
      );
      const body = (await r.json().catch(() => ({}))) as { costCap?: number; accountType?: string };
      const usage = (await u.json().catch(() => ({}))) as { costs?: { SMS?: number }; counts?: { SMS?: number }; billingCycleEnd?: string };
      const spent = usage.costs?.SMS ?? 0;
      const cap = body.costCap ?? 0;
      const exhausted = r.ok && u.ok && cap > 0 && spent >= cap;
      checks.pingram = !r.ok
        ? { ok: false, detail: `account check ${r.status}` }
        : {
            // At the cap Pingram accepts the request and discards the SMS, so
            // this is a real outage for Norma even though sends return 2xx.
            ok: !exhausted,
            detail: `plan ${body.accountType ?? "?"}, SMS $${spent.toFixed(2)} of $${cap}/mo cap (${usage.counts?.SMS ?? "?"} msgs), cycle resets ${usage.billingCycleEnd?.slice(0, 10) ?? "?"}${exhausted ? " — BUDGET EXHAUSTED, outbound SMS discarded" : ""}`,
          };
    } catch (e) {
      checks.pingram = { ok: false, detail: String(e) };
    }
  }

  // Anthropic: smallest real call. Credit exhaustion returns 400 here, which is
  // precisely the failure the old presence-check could not see.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    checks.anthropic = { ok: false, detail: "ANTHROPIC_API_KEY not set" };
  } else {
    try {
      const r = await withTimeout(
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
          cache: "no-store",
        }),
        15000
      );
      if (r.ok) {
        checks.anthropic = { ok: true };
      } else {
        const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        checks.anthropic = { ok: false, detail: body?.error?.message ?? `HTTP ${r.status}` };
      }
    } catch (e) {
      checks.anthropic = { ok: false, detail: String(e) };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}

export const GET = withEventLog("GET /api/health", __GET);
