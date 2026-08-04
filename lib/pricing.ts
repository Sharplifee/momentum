import { SupabaseClient } from "@supabase/supabase-js";

type ChecklistFlags = {
  premium_handling?: boolean | null;
  bags_clippings?: boolean | null;
  haul_clippings?: boolean | null;
};

export type PricingModifier = { label: string; price: number; blocked?: boolean };

/**
 * Pricing modifiers from the on-site personal-quote checklist. Quotes are
 * in-person only (HARD RULE) — this only ever runs against staff-captured
 * property/lead flags, never from something Wayne or a customer said over text.
 */
export async function pricingModifiers(db: SupabaseClient, flags: ChecklistFlags): Promise<PricingModifier[]> {
  const { data: cfg } = await db.from("system_config").select("value").eq("key", "pricing").single();
  const v = (cfg?.value ?? {}) as Record<string, unknown>;
  const modifiers: PricingModifier[] = [];
  if (flags.premium_handling) {
    modifiers.push({ label: "Premium handling (weekly obstacle moves)", price: Number(v.premium_handling_surcharge ?? 15) });
  }
  if (flags.bags_clippings) {
    modifiers.push({ label: "Bagging clippings", price: Number(v.bags_clippings_surcharge ?? 10) });
  }
  if (flags.haul_clippings) {
    const allowed = Boolean(v.haul_clippings_allowed);
    modifiers.push({
      label: allowed ? "Clipping haul-away" : "Clipping haul-away — refused by default, needs staff override",
      price: allowed ? Number(v.haul_clippings_surcharge ?? 20) : 0,
      blocked: !allowed,
    });
  }
  return modifiers;
}
