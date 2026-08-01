import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Every 15 min via pg_cron: deliver due quiet-hours-queued sends (punch list 1.2). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: due } = await db
    .from("scheduled_sends")
    .select("*")
    .is("sent_at", null)
    .eq("cancelled", false)
    .lte("send_after", new Date().toISOString())
    .order("send_after")
    .limit(50);

  const delivered: number[] = [];
  for (const row of due ?? []) {
    const result = await sendSms({
      to: row.phone,
      message: row.body ?? "",
      thread_id: row.thread_id,
      sender: (row.sender as "wayne" | "staff" | "system") ?? "system",
      skipQueue: true,
    });
    if (result.ok) {
      await db.from("scheduled_sends").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
      delivered.push(row.id);
    }
  }
  await logAutomation({ trigger: "cron.scheduled_sends", detail: { due: due?.length ?? 0, delivered } });
  return NextResponse.json({ ok: true, due: due?.length ?? 0, delivered });
}
