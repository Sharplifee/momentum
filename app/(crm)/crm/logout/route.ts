import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { withEventLog } from "@/lib/eventLog";

async function __POST(req: Request) {
  const db = supabaseServer();
  await db.auth.signOut();
  // The login page reads ?reason and shows the "You're signed out" door instead
  // of dropping straight into the form.
  return NextResponse.redirect(new URL("/crm/login?reason=signed_out", req.url), { status: 302 });
}

export const POST = withEventLog("POST /(crm)/crm/logout", __POST);
