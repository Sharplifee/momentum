import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Job photo upload → Supabase Storage bucket job-photos (created on first use). */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager", "crew"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const jobId = String(form.get("job_id") ?? "");
  const photo = form.get("photo") as File | null;
  if (!jobId || !photo) return NextResponse.json({ error: "job_id and photo required" }, { status: 400 });

  const db = supabaseAdmin();
  // ensure bucket exists (idempotent)
  await db.storage.createBucket("job-photos", { public: false }).catch(() => null);

  const path = `${jobId}/${Date.now()}.jpg`;
  const { error: upErr } = await db.storage.from("job-photos").upload(path, photo, { contentType: "image/jpeg" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: signed } = await db.storage.from("job-photos").createSignedUrl(path, 60 * 60 * 24 * 30);
  await db.from("job_events").insert({ job_id: jobId, type: "photo", photo_url: path, actor: staff.full_name ?? "crew" });
  return NextResponse.json({ ok: true, path, signed_url: signed?.signedUrl });
}
