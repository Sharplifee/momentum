import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const form = await req.formData();

  const receipt = form.get("receipt") as File | null;
  let receiptPath: string | null = null;
  if (receipt && receipt.size > 0) {
    await db.storage.createBucket("receipts", { public: false }).catch(() => null);
    receiptPath = `${Date.now()}-${receipt.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await db.storage.from("receipts").upload(receiptPath, receipt, { contentType: receipt.type || "image/jpeg" });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: expense, error } = await db.from("expenses").insert({
    category: String(form.get("category") ?? "other"),
    amount: Number(form.get("amount")),
    vendor: String(form.get("vendor") ?? "") || null,
    expense_date: String(form.get("expense_date")),
    job_id: String(form.get("job_id") ?? "") || null,
    receipt_url: receiptPath,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAutomation({ trigger: "expense.created", ref_id: String(expense.id), detail: { by: staff.full_name, amount: Number(form.get("amount")) } });
  return NextResponse.json({ ok: true, id: expense.id });
}

/** GET ?receipt={expense_id} → redirect to signed receipt URL. */
export async function GET(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const expenseId = req.nextUrl.searchParams.get("receipt");
  if (!expenseId) return NextResponse.json({ error: "receipt param required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: expense } = await db.from("expenses").select("receipt_url").eq("id", expenseId).single();
  if (!expense?.receipt_url) return NextResponse.json({ error: "no receipt" }, { status: 404 });
  const { data: signed } = await db.storage.from("receipts").createSignedUrl(expense.receipt_url, 3600);
  if (!signed?.signedUrl) return NextResponse.json({ error: "sign failed" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
