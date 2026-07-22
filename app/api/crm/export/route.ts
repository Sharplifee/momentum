import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** CSV export for leads/customers/jobs (manager+). GET /api/crm/export?entity=leads */
export async function GET(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entity = req.nextUrl.searchParams.get("entity");
  const db = supabaseAdmin();

  let rows: Record<string, unknown>[] = [];
  if (entity === "leads") {
    const { data } = await db.from("leads").select("id, full_name, phone, email, address, city, zone_id, stage, service_interest, quote_amount, source, created_at").neq("source", "test").limit(5000);
    rows = data ?? [];
  } else if (entity === "customers") {
    const { data } = await db.from("customers").select("id, full_name, phone, email, status, source, lifetime_value, created_at").limit(5000);
    rows = data ?? [];
  } else if (entity === "jobs") {
    const { data } = await db.from("jobs").select("id, customer_id, scheduled_date, status, price, crew_id, zone_id, arrival_at, departure_at").limit(5000);
    rows = data ?? [];
  } else if (entity === "invoices") {
    const { data } = await db.from("invoices").select("id, number, customer_id, job_id, subtotal, tax, total, status, due_date, sent_at, created_at").limit(5000);
    rows = data ?? [];
  } else if (entity === "payments") {
    const { data } = await db.from("payments").select("id, invoice_id, amount, method, stripe_id, note, paid_at").limit(5000);
    rows = data ?? [];
  } else if (entity === "expenses") {
    const { data } = await db.from("expenses").select("id, category, amount, vendor, expense_date, job_id, created_at").limit(5000);
    rows = data ?? [];
  } else {
    return NextResponse.json({ error: "entity must be leads|customers|jobs|invoices|payments|expenses" }, { status: 400 });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="momentum-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
