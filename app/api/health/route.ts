import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // db
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("system_config").select("key").limit(1);
    checks.db = { ok: !error, detail: error?.message };
  } catch (e) {
    checks.db = { ok: false, detail: String(e) };
  }

  // pingram (config presence only — no test send)
  checks.pingram = {
    ok: Boolean(process.env.PINGRAM_API_KEY && process.env.PINGRAM_FROM_NUMBER),
  };

  // anthropic (config presence only)
  checks.anthropic = { ok: Boolean(process.env.ANTHROPIC_API_KEY) };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}
