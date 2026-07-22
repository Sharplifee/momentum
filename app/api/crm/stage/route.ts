import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { runStageAutomation } from "@/lib/stages";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { lead_id, stage } = await req.json().catch(() => ({}));
  if (!lead_id || !stage) return NextResponse.json({ error: "lead_id and stage required" }, { status: 400 });
  const result = await runStageAutomation(lead_id, stage, staff.full_name ?? staff.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
