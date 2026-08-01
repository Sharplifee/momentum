import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const db = supabaseServer();
  await db.auth.signOut();
  return NextResponse.redirect(new URL("/crm/login", req.url), { status: 302 });
}
