import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Every automated action in Momentum writes a row here — this is the
 * single audit trail the Automations Log (Phase 2) reads from and what
 * "DONE = everything visible in DB" depends on.
 */
export async function logAutomation(params: {
  trigger: string;
  ref_id?: string | null;
  status?: "ok" | "error" | "skipped";
  detail?: Record<string, unknown>;
  error?: string;
}) {
  const db = supabaseAdmin();
  const { error } = await db.from("automation_runs").insert({
    trigger: params.trigger,
    ref_id: params.ref_id ?? null,
    status: params.status ?? "ok",
    detail: params.detail ?? null,
    error: params.error ?? null,
  });
  if (error) {
    // Never let logging failures break the caller's actual work — just surface to server logs.
    console.error("logAutomation failed", params.trigger, error);
  }
}
