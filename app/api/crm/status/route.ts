import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm";
import { withEventLog } from "@/lib/eventLog";

export const dynamic = "force-dynamic";

async function __GET() {
  try {
    const { db } = await requireStaff(["owner", "manager", "crew"]);
    const { data } = await db.from("system_config").select("value").eq("key", "launch_checklist").single();
    const items = ((data?.value as any)?.items ?? []).filter((i: any) => !i.done);
    return NextResponse.json({ blockers: items.length, items: items.map((i: any) => i.label) });
  } catch {
    return NextResponse.json({ blockers: 0, items: [] });
  }
}

export const GET = withEventLog("GET /api/crm/status", __GET);
