import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Accept or reject a suggested address correction.
 *
 * Accepting writes the corrected address and clears the property's stale fence,
 * so the next resolver run re-fences it from the right parcel. Rejecting closes
 * the suggestion without touching the address.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, accept } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: s } = await db
    .from("address_suggestions")
    .select("id, property_id, suggested, suggested_city")
    .eq("id", id)
    .single();
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();

  if (accept) {
    const { error } = await db
      .from("properties")
      .update({
        address: s.suggested,
        city: s.suggested_city,
        parcel_ring: null,        // force a clean re-fence from the right parcel
        geocode_source: null,
      })
      .eq("id", s.property_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // the others for this property are moot once one is chosen
    await db.from("address_suggestions")
      .update({ status: "rejected", resolved_by: staff.id, resolved_at: now })
      .eq("property_id", s.property_id).eq("status", "open").neq("id", s.id);
    await db.from("address_suggestions")
      .update({ status: "accepted", resolved_by: staff.id, resolved_at: now })
      .eq("id", s.id);
  } else {
    await db.from("address_suggestions")
      .update({ status: "rejected", resolved_by: staff.id, resolved_at: now })
      .eq("id", s.id);
  }

  return NextResponse.json({ ok: true });
}
