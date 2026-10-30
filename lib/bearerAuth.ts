import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Auth for the native crew app's background calls.
 *
 * The app has no cookie session of its own — it lifts the Supabase access
 * token out of the CRM WebView and sends it as a Bearer header from the
 * background location task and the push-token registration. Those calls
 * run with no page loaded, so cookie-based staffFromSession() cannot see them.
 */
export async function staffFromBearer(req: NextRequest, roles: string[] = ["owner", "manager", "crew"]) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await db.from("profiles").select("id, role, full_name").eq("id", user.id).single();
  if (!profile || !roles.includes(profile.role)) return null;
  return profile;
}
