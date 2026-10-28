import { NextRequest, NextResponse } from "next/server";
import { runNora } from "@/lib/nora";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Direct Norma invocation — used by the inbound SMS webhook and (later) the portal/CRM.
 *  Guarded: internal callers only (CRON_SECRET). The SMS webhook calls runNora()
 *  in-process, so nothing public ever needs this route. */
async function __POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.thread_id || !body?.phone || !body?.message) {
    return NextResponse.json({ error: "thread_id, phone, message required" }, { status: 400 });
  }
  const reply = await runNora(
    {
      thread_id: body.thread_id,
      phone: body.phone,
      lead_id: body.lead_id ?? null,
      customer_id: body.customer_id ?? null,
    },
    String(body.message)
  );
  return NextResponse.json({ ok: true, reply });
}

export const POST = withEventLog("POST /api/nora", __POST);
