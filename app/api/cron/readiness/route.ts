import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

const OBSTACLE_LINES: Record<string, string> = {
  trampoline: "move the trampoline off the mow line",
  hose: "coil up any hoses",
  hoses: "coil up any hoses",
  toys: "clear toys off the lawn",
};

function flagLines(p: { has_dog?: boolean | null; obstacles?: string[] | null }): string {
  const lines: string[] = [];
  if (p.has_dog) lines.push("pick up after your dog");
  for (const o of p.obstacles ?? []) {
    const line = OBSTACLE_LINES[o.toLowerCase()];
    if (line) lines.push(line);
  }
  return lines.join(" and ");
}

/**
 * Day-of readiness SMS, targeted by property flags and gated by behavior grade.
 * Green customers (clean record) are never messaged. Orange gets a standard ask.
 * Red gets firm wording and a note is left on site by the crew (crm/today "Yard
 * not ready" report already does the on-site part).
 *
 * OFF by default — system_config.tracking.readiness_sms_enabled must be set true.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: cfg } = await db.from("system_config").select("value").eq("key", "tracking").single();
  const enabled = Boolean((cfg?.value as any)?.readiness_sms_enabled);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const { data: jobs } = await db
    .from("jobs")
    .select("id, customer_id, property_id, customers(id, full_name, phone, sms_opt_out, behavior_grade, behavior_grade_override), properties(has_dog, obstacles)")
    .eq("scheduled_date", today)
    .eq("status", "scheduled");

  let sent = 0, skippedGreen = 0, skippedSandbox = 0;
  for (const j of (jobs ?? []) as any[]) {
    const c = j.customers;
    const p = j.properties;
    if (!c?.phone) continue;
    const grade = c.behavior_grade_override ?? c.behavior_grade ?? "green";
    if (grade === "green") { skippedGreen++; continue; }

    const flags = flagLines(p ?? {});
    const flagAsk = flags ? ` Please ${flags} before we arrive.` : "";
    const firstName = (c.full_name ?? "there").split(" ")[0];
    const message = grade === "red"
      ? `${firstName}, we're on our way today. Keep the ball rolling — please have the yard ready.${flagAsk} Break our momentum and it's going to cost you. We'll leave a note if it's not ready. — Momentum Landscaping`
      : `${firstName}, we're on our way today.${flagAsk} Keep the ball rolling! — Momentum Landscaping`;

    if (!enabled) { skippedSandbox++; continue; }

    const r = await sendSms({ to: c.phone, message, sender: "system" });
    await logAutomation({ trigger: "cron.readiness", ref_id: j.id, status: r.ok ? "ok" : "error", detail: { customer_id: c.id, grade, flags } });
    if (r.ok) sent++;
  }

  await logAutomation({ trigger: "cron.readiness.summary", detail: { enabled, sent, skippedGreen, skippedSandbox, total: (jobs ?? []).length } });
  return NextResponse.json({ ok: true, enabled, sent, skippedGreen, skippedSandbox });
}
