import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { staffFromSession } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Wayne CRM assistant mode (build plan 5): staff chat, read-everything,
 * DRAFTS ONLY — this endpoint never sends anything. Drafts come back to the
 * UI for one-tap approval through the normal send paths.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromSession(["owner", "manager"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { question, lead_id, customer_id } = await req.json().catch(() => ({}));
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  const db = supabaseAdmin();
  let context = "";
  if (lead_id) {
    const { data: lead } = await db.from("leads").select("*").eq("id", lead_id).single();
    context += `\nLEAD: ${JSON.stringify(lead)}`;
  }
  if (customer_id) {
    const [{ data: cust }, { data: jobs }] = await Promise.all([
      db.from("customers").select("*").eq("id", customer_id).single(),
      db.from("jobs").select("scheduled_date, status, price").eq("customer_id", customer_id).order("scheduled_date", { ascending: false }).limit(10),
    ]);
    context += `\nCUSTOMER: ${JSON.stringify(cust)}\nRECENT JOBS: ${JSON.stringify(jobs)}`;
  }
  const { data: stats } = await db.from("leads").select("stage").neq("source", "test");
  const counts: Record<string, number> = {};
  for (const l of stats ?? []) counts[l.stage] = (counts[l.stage] ?? 0) + 1;
  context += `\nPIPELINE COUNTS: ${JSON.stringify(counts)}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { data: wayneCfg } = await db.from("system_config").select("value").eq("key", "wayne").single();
  const model = (wayneCfg?.value as any)?.model ?? "claude-sonnet-4-5";

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: `You are Wayne in CRM assistant mode, helping Momentum Landscaping staff. You can see business data provided below. You DRAFT messages and quotes when asked — you never send anything; a human taps send. Be concise and practical. Business context:${context}`,
      messages: [{ role: "user", content: String(question) }],
    });
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    await logAutomation({ trigger: "wayne.assistant", detail: { by: staff.full_name, tokens_out: response.usage.output_tokens } });
    return NextResponse.json({ ok: true, draft: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAutomation({ trigger: "wayne.assistant", status: "error", error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
