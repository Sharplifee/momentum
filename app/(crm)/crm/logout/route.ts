import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { withEventLog } from "@/lib/eventLog";

async function __POST(req: Request) {
  const db = supabaseServer();
  await db.auth.signOut();
  return NextResponse.redirect(new URL("/crm/login", req.url), { status: 302 });
}

export const POST = withEventLog("POST /(crm)/crm/logout", __POST);
