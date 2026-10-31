import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether outbound texting is currently paused, from the launch checklist's
 * live probe of the provider (item `sms_outbound`). Returns a short reason or
 * null. Forms use it so a "text the customer" switch is never left on when
 * nothing can leave.
 */
export async function smsPausedReason(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("system_config").select("value").eq("key", "launch_checklist").maybeSingle();
  const items = (((data?.value as any)?.items ?? []) as { id?: string; done?: boolean }[]);
  const open = items.find((i) => i.id === "sms_outbound" && !i.done);
  return open ? "SMS budget cap reached — texts are being discarded until billing is raised" : null;
}
