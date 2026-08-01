import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

/** Portal auth: current customer (by profile link) or redirect to login. */
export async function requireCustomer() {
  const db = supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/portal/login");
  const admin = supabaseAdmin();
  const { data: customer } = await admin.from("customers").select("*").eq("profile_id", user.id).maybeSingle();
  if (!customer) redirect("/portal/login");
  return { user, customer, db, admin };
}
