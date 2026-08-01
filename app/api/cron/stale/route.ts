import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/** 6:30 MT: flag quotes >72h and unanswered threads for the dashboard. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - 72 * 3600_000).toISOString();

  const { data: staleQuotes } = await db
    .from("quotes")
    .select("id, lead_id")
    .eq("status", "sent")
    .lt("sent_at", cutoff);

  const { data: staleThreads } = await db
    .from("threads")
    .select("id, phone")
    .lt("last_message_at", cutoff)
    .eq("escalated", false);

  await logAutomation({
    trigger: "cron.stale",
    detail: {
      stale_quotes: (staleQuotes ?? []).map((q) => q.id),
      stale_thread_count: staleThreads?.length ?? 0,
    },
  });
  return NextResponse.json({ ok: true, stale_quotes: staleQuotes?.length ?? 0, stale_threads: staleThreads?.length ?? 0 });
}
