import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type Role = "customer" | "crew" | "manager" | "owner";

/**
 * Server-component guard for CRM pages. Redirects to login when absent, to the
 * account page when a temp password must be changed, and to Today when a role
 * is too low for the page. `allowMustChange` lets the account page itself load.
 */
export async function requireStaff(minRoles: Role[] = ["crew", "manager", "owner"], allowMustChange = false) {
  const db = supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/crm/login");
  const { data: profile } = await db
    .from("profiles")
    .select("id, role, full_name, email, phone, must_change_password, theme_pref, notif_prefs")
    .eq("id", user.id)
    .single();
  const role = (profile?.role ?? "customer") as Role;
  if (!minRoles.includes(role)) redirect(role === "crew" ? "/crm/today" : "/crm/login");
  if (!allowMustChange && profile?.must_change_password) redirect("/crm/account?first=1");
  return { user, profile: profile!, role, db };
}
