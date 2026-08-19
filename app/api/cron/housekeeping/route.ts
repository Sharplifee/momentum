import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms, renderTemplate } from "@/lib/sms";
import { getBillingConfig, displayNumber } from "@/lib/invoices";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily 9:00 MT: (a) overdue invoice sweep — mark overdue, ≤2 gentle reminders,
 * then escalate to Connor (never Nora collections); (b) backup verification —
 * row counts + last ids per money table logged for drift detection (Phase 4 §5.2).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const cfg = await getBillingConfig();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  // (a) overdue sweep
  const { data: overdue } = await db
    .from("invoices")
    .select("id, number, total, status, due_date, reminders_sent, customers(full_name, phone, sms_opt_out)")
    .in("status", ["sent", "overdue"])
    .lt("due_date", today);

  let reminded = 0, escalated = 0;
  for (const inv of (overdue ?? []) as any[]) {
    if (inv.status === "sent") await db.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
    if (inv.reminders_sent < 2) {
      const c = inv.customers;
      if (c?.phone && !c.sms_opt_out) {
        const r = await sendSms({
          to: c.phone,
          message: `Friendly reminder from Momentum Landscaping — invoice ${displayNumber(cfg.invoice_prefix, inv.number)} ($${Number(inv.total).toFixed(2)}) is past due. Reply here with any questions. 🌱`,
          sender: "system",
        });
        if (r.ok || (r as any).reason === "queued_quiet_hours") {
          await db.from("invoices").update({ reminders_sent: inv.reminders_sent + 1 }).eq("id", inv.id);
          reminded++;
        }
      }
    } else if (inv.reminders_sent === 2) {
      await sendSms({
        to: "+13853076535",
        message: `Invoice ${displayNumber(cfg.invoice_prefix, inv.number)} ($${Number(inv.total).toFixed(2)}, ${inv.customers?.full_name}) is still unpaid after 2 reminders — your call on next steps.`,
        sender: "system", bypassQuietHours: true,
      });
      await db.from("invoices").update({ reminders_sent: 3 }).eq("id", inv.id); // marks escalated
      escalated++;
    }
  }

  // (b) backup verification — counts + last ids for drift detection
  const tables = ["invoices", "payments", "expenses", "customers", "jobs"];
  const snapshot: Record<string, { count: number | null; last_id: string | number | null }> = {};
  for (const t of tables) {
    const { count } = await db.from(t).select("*", { count: "exact", head: true });
    const { data: last } = await db.from(t).select("id").order("id", { ascending: false }).limit(1).maybeSingle();
    snapshot[t] = { count: count ?? null, last_id: last?.id ?? null };
  }

  await logAutomation({ trigger: "cron.housekeeping", detail: { date: today, overdue: overdue?.length ?? 0, reminded, escalated, backup_snapshot: snapshot } });
  return NextResponse.json({ ok: true, overdue: overdue?.length ?? 0, reminded, escalated, snapshot });
}
