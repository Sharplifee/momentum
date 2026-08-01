import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await requireStaff(["owner", "manager", "crew"]);
    const { data } = await db.from("system_config").select("value").eq("key", "launch_checklist").single();
    const items = ((data?.value as any)?.items ?? []).filter((i: any) => !i.done);
    return NextResponse.json({ blockers: items.length, items: items.map((i: any) => i.label) });
  } catch {
    return NextResponse.json({ blockers: 0, items: [] });
  }
}
