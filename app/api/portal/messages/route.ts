import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWayne } from "@/lib/wayne";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

async function customerFromSession() {
  const s = supabaseServer();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data: customer } = await admin.from("customers").select("id, phone, full_name").eq("profile_id", user.id).maybeSingle();
  return customer;
}

export async function GET(req: NextRequest) {
  const customer = await customerFromSession();
  if (!customer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const threadId = req.nextUrl.searchParams.get("thread_id");
  const admin = supabaseAdmin();
  // ownership check — thread must belong to this customer's phone
  const { data: thread } = await admin.from("threads").select("id, phone").eq("id", threadId!).single();
  if (!thread || thread.phone !== customer.phone) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: messages } = await admin.from("messages").select("id, direction, sender, channel, body, created_at").eq("thread_id", thread.id).order("created_at").limit(100);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const customer = await customerFromSession();
  if (!customer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { thread_id, body } = await req.json().catch(() => ({}));
  if (!thread_id || !body) return NextResponse.json({ error: "thread_id and body required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: thread } = await admin.from("threads").select("id, phone, escalated, lead_id").eq("id", thread_id).single();
  if (!thread || thread.phone !== customer.phone) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // store the portal message on the SAME thread as SMS (channel=portal)
  await admin.from("messages").insert({
    thread_id: thread.id, channel: "portal", direction: "inbound", sender: "customer", body: String(body),
  });
  await admin.from("threads").update({ last_message_at: new Date().toISOString(), customer_id: customer.id }).eq("id", thread.id);

  // escalated → store only (staff has both channels)
  if (!thread.escalated) {
    const reply = await runWayne(
      { thread_id: thread.id, phone: customer.phone, lead_id: thread.lead_id, customer_id: customer.id, channel: "portal" },
      String(body)
    ).catch(async (err) => {
      await logAutomation({ trigger: "wayne.portal_error", status: "error", error: String(err) });
      return null;
    });
    if (reply) {
      // portal replies land in the thread (no SMS needed — customer is right here)
      await admin.from("messages").insert({ thread_id: thread.id, channel: "portal", direction: "outbound", sender: "wayne", body: reply });
    }
  }

  const { data: messages } = await admin.from("messages").select("id, direction, sender, channel, body, created_at").eq("thread_id", thread.id).order("created_at").limit(100);
  await logAutomation({ trigger: "portal.message", ref_id: thread.id, detail: { customer: customer.id } });
  return NextResponse.json({ ok: true, messages });
}
