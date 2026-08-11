import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SERVICE_AREA_FALLBACK, type ServiceArea } from "@/lib/serviceArea.static";

export type { ServiceArea };
export { SERVICE_AREA_FALLBACK };

/**
 * Where Momentum actually works, derived from the zones table.
 *
 * Nine surfaces used to state this independently and they disagreed — five
 * still said "northern Utah County", the territory Momentum left on
 * 2026-08-01, and Wayne was telling customers we serve Lehi, Saratoga Springs
 * and Eagle Mountain. Deactivating a zone must be the only action needed to
 * change what every surface says.
 *
 * Cached per request, and falls back rather than rendering nothing.
 */
export const getServiceArea = cache(async function getServiceArea(): Promise<ServiceArea> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("zones").select("cities").eq("active", true);
    if (error || !data?.length) return SERVICE_AREA_FALLBACK;

    const seen = new Set<string>();
    for (const z of data) {
      for (const c of ((z as any).cities ?? []) as string[]) {
        const name = String(c).trim();
        if (name) seen.add(name);
      }
    }
    if (!seen.size) return SERVICE_AREA_FALLBACK;

    return { ...SERVICE_AREA_FALLBACK, cities: [...seen] };
  } catch {
    return SERVICE_AREA_FALLBACK;
  }
});

/** "Sandy, Draper, Riverton and 12 more" — for places with no room for a list. */
export function citiesSentence(a: ServiceArea, max = 6): string {
  const c = a.cities;
  if (c.length <= max) {
    return c.length < 2 ? c[0] ?? "" : `${c.slice(0, -1).join(", ")} and ${c.at(-1)}`;
  }
  return `${c.slice(0, max).join(", ")} and ${c.length - max} more`;
}
