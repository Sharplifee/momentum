import { NextRequest, NextResponse } from "next/server";
import { sendMetaCapiEvent, CapiEventInput } from "@/lib/meta";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/** Internal shared CAPI sender over HTTP (build plan 3.3). Guarded by CRON_SECRET so it can't be hit publicly. */
async function __POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as CapiEventInput | null;
  if (!body?.event_name || !body?.event_id) {
    return NextResponse.json({ error: "event_name and event_id required" }, { status: 400 });
  }
  const result = await sendMetaCapiEvent(body);
  return NextResponse.json(result);
}

export const POST = withEventLog("POST /api/meta/capi", __POST);
