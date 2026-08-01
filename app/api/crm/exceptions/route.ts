import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Resolve a service exception raised by the GPS verification engine. */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, action } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = supabaseAdmin();

  if (action === "reopen") {
    const { error } = await db.from("exceptions").update({ resolved: false, resolved_at: null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await db
    .from("exceptions")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
