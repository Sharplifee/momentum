import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";

/** Self-service account actions for ANY authenticated staff/customer on their OWN row. */
export async function POST(req: NextRequest) {
  const s = supabaseServer();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (body.action === "theme") {
    await admin.from("profiles").update({ theme_pref: body.theme === "dark" ? "dark" : "light" }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "profile") {
    const patch: Record<string, unknown> = {};
    if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
    if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;
    if (body.notif_prefs && typeof body.notif_prefs === "object") patch.notif_prefs = body.notif_prefs;
    const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAutomation({ trigger: "account.profile_update", ref_id: user.id });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "password") {
    const { current_password, new_password } = body;
    if (!current_password || !new_password || String(new_password).length < 8) {
      return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
    }
    // re-authenticate with the current password before allowing the change
    if (!user.email) return NextResponse.json({ error: "no email on account" }, { status: 400 });
    const reauth = await s.auth.signInWithPassword({ email: user.email, password: String(current_password) });
    if (reauth.error) return NextResponse.json({ error: "current password is incorrect" }, { status: 401 });

    const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { password: String(new_password) });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
    await admin.from("profiles").update({ must_change_password: false }).eq("id", user.id);
    await logAutomation({ trigger: "account.password_changed", ref_id: user.id });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
