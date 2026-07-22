import { supabaseAdmin } from "@/lib/supabase/admin";

export type AvailableDay = { date: string; slots_remaining: number; crew_id: number };

function candidateDates(maxDays = 30): string[] {
  const today = new Date();
  const out: string[] = [];
  for (let i = 1; out.length < 20 && i < maxDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue; // Sundays off
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function openDaysForCrew(
  crew: { id: number; max_daily_jobs: number | null },
  count: number
): Promise<AvailableDay[]> {
  const db = supabaseAdmin();
  const dates = candidateDates();

  const [{ data: capacityRows }, { data: jobRows }] = await Promise.all([
    db.from("capacity").select("day, slots_total, slots_booked").eq("crew_id", crew.id).in("day", dates),
    db
      .from("jobs")
      .select("scheduled_date")
      .eq("crew_id", crew.id)
      .in("scheduled_date", dates)
      .neq("status", "cancelled"),
  ]);

  const capByDay = new Map((capacityRows ?? []).map((r) => [r.day as string, r]));
  const jobCount = new Map<string, number>();
  for (const j of jobRows ?? []) {
    jobCount.set(j.scheduled_date, (jobCount.get(j.scheduled_date) ?? 0) + 1);
  }

  const results: AvailableDay[] = [];
  for (const date of dates) {
    const cap = capByDay.get(date);
    // specced fallback (punch list 1.1): no capacity row → slots_total from crew.max_daily_jobs,
    // slots_booked = actual count of that crew's jobs that day
    const slotsTotal = cap?.slots_total ?? crew.max_daily_jobs ?? 12;
    const slotsBooked = Math.max(cap?.slots_booked ?? 0, jobCount.get(date) ?? 0);
    const remaining = slotsTotal - slotsBooked;
    if (remaining > 0) results.push({ date, slots_remaining: remaining, crew_id: crew.id });
    if (results.length >= count) break;
  }
  return results;
}

/**
 * Next `count` open days for a zone. NEVER returns [] while any active crew
 * has an open day: zone crew first, then global fallback across all crews
 * (nearest days win) for unresolvable/full zones.
 */
export async function getAvailability(zoneId: number | null, count = 2): Promise<AvailableDay[]> {
  const db = supabaseAdmin();

  if (zoneId != null) {
    const { data: crew } = await db
      .from("crews")
      .select("id, max_daily_jobs")
      .eq("home_zone", zoneId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (crew) {
      const days = await openDaysForCrew(crew, count);
      if (days.length >= count) return days;
    }
  }

  // global fallback: merge all active crews' open days, earliest first
  const { data: crews } = await db.from("crews").select("id, max_daily_jobs").eq("active", true);
  const all: AvailableDay[] = [];
  for (const crew of crews ?? []) {
    all.push(...(await openDaysForCrew(crew, count)));
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  // dedupe by date (prefer earliest-listed crew)
  const seen = new Set<string>();
  const merged = all.filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true)));
  return merged.slice(0, count);
}
