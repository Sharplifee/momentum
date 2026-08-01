import { supabaseServer } from "@/lib/supabase/server";

/** Route-handler auth: returns the caller's profile+role or null. */
export async function staffFromSession(minRoles: string[] = ["owner", "manager"]) {
  const db = supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from("profiles").select("id, role, full_name").eq("id", user.id).single();
  if (!profile || !minRoles.includes(profile.role)) return null;
  return profile;
}
