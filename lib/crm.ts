import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type Role = "customer" | "crew" | "manager" | "owner";

/** Server-component helper: current user + role, redirecting to login when absent. */
export async function requireStaff(minRoles: Role[] = ["crew", "manager", "owner"]) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/crm/login");
  const { data: profile } = await db.from("profiles").select("id, role, full_name, email").eq("id", user.id).single();
  const role = (profile?.role ?? "customer") as Role;
  if (!minRoles.includes(role)) redirect("/crm/today"); // crew land on Today
  return { user, profile: profile!, role, db };
}
