import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Global search across leads, customers, jobs, threads (owner/manager). */
export async function GET(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const db = supabaseAdmin();
  const like = `%${q}%`;

  const [leads, customers, jobs, threads] = await Promise.all([
    db.from("leads").select("id, full_name, phone, city, stage").or(`full_name.ilike.${like},phone.ilike.${like},address.ilike.${like}`).neq("source", "test").limit(5),
    db.from("customers").select("id, full_name, phone").or(`full_name.ilike.${like},phone.ilike.${like}`).limit(5),
    db.from("jobs").select("id, scheduled_date, status, customers(full_name), properties(address)").limit(5).ilike("properties.address", like),
    db.from("threads").select("id, phone, customers(full_name), leads(full_name)").ilike("phone", like).limit(5),
  ]);

  const hits = [
    ...(leads.data ?? []).map((l) => ({ type: "lead", id: l.id, label: l.full_name ?? l.phone, sub: `${l.city ?? ""} · ${l.stage}`, href: `/crm/leads/${l.id}` })),
    ...(customers.data ?? []).map((c) => ({ type: "customer", id: c.id, label: c.full_name, sub: c.phone, href: `/crm/customers/${c.id}` })),
    ...(jobs.data ?? []).map((j: any) => ({ type: "job", id: j.id, label: j.customers?.full_name ?? j.properties?.address ?? "Job", sub: `${j.scheduled_date} · ${j.status}`, href: `/crm/jobs` })),
    ...(threads.data ?? []).map((t: any) => ({ type: "thread", id: t.id, label: t.customers?.full_name ?? t.leads?.full_name ?? t.phone, sub: t.phone, href: `/crm/messages?thread=${t.id}` })),
  ];
  return NextResponse.json({ hits });
}
