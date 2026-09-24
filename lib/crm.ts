import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export type Role = "customer" | "crew" | "manager" | "owner";

/**
 * Server-component guard for CRM pages. Redirects to login when absent, to the
 * account page when a temp password must be changed, and to Today when a role
 * is too low for the page. `allowMustChange` lets the account page itself load.
 *
 * Wrapped in cache() so the auth round trip and profile lookup happen once per
 * request rather than once per component that asks — pages and the nav shell
 * both need the profile, and that was two extra network hops on every tap.
 */
/** Cookie that puts an admin into the crew view. UI only — never an API grant. */
export const VIEW_AS_COOKIE = "mo_view_as";
/** Who may preview. A crew member cannot preview anything. */
export const CAN_PREVIEW: Role[] = ["owner", "manager"];

/**
 * All three principals are owners; nobody holds a crew account. The Today
 * screen was therefore unreachable — Shell gates it to roles:["crew"].
 *
 * This returns an EFFECTIVE role, so previewing genuinely redirects out of
 * /crm/accounting the way a crew phone would be. staffFromSession in
 * lib/apiAuth.ts deliberately keeps the REAL role, so a preview can never
 * downgrade a write or grant access it should not have.
 */
export const requireStaff = cache(async function requireStaff(minRoles: Role[] = ["crew", "manager", "owner"], allowMustChange = false) {
  // Replica mirror: no login gate. Reads as the owner through the service
  // role so every page renders real data without a session.
  if (process.env.NEXT_PUBLIC_REPLICA_OPEN === "1") {
    const adb = supabaseAdmin() as unknown as ReturnType<typeof supabaseServer>;
    const { data: p } = await adb
      .from("profiles")
      .select("id, role, full_name, email, phone, must_change_password, theme_pref, notif_prefs")
      .eq("id", "51730e9a-e47b-4053-af2b-5b8a9cecac55")
      .single();
    const { cookies: ck } = await import("next/headers");
    const va = (await ck()).get(VIEW_AS_COOKIE)?.value;
    const prev = va === "crew";
    return {
      user: { id: p!.id, email: p!.email } as never,
      profile: p!, role: (prev ? "crew" : "owner") as Role,
      realRole: "owner" as Role, previewing: prev, db: adb,
    };
  }

  const db = supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/crm/login");
  const { data: profile } = await db
    .from("profiles")
    .select("id, role, full_name, email, phone, must_change_password, theme_pref, notif_prefs")
    .eq("id", user.id)
    .single();
  const realRole = (profile?.role ?? "customer") as Role;

  const { cookies } = await import("next/headers");
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  const previewing = viewAs === "crew" && CAN_PREVIEW.includes(realRole);
  const role: Role = previewing ? "crew" : realRole;

  if (!minRoles.includes(role)) redirect(role === "crew" ? "/crm/today" : "/crm/login");
  if (!allowMustChange && profile?.must_change_password) redirect("/crm/account?first=1");
  return { user, profile: profile!, role, realRole, previewing, db };
});
