import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

/**
 * Autonomous service verification.
 *
 * Every logged-in device reports its position. This engine decides, with no human
 * input, whether someone was actually AT a client's property long enough to have
 * performed the service — then closes the job out and writes a proof record for
 * the books.
 *
 * Drive-by rejection: passing a house at 25mph crosses a 140m fence in ~13 seconds.
 * A visit only becomes "arrived" after ARRIVAL_DWELL minutes of continuous presence,
 * and only becomes "serviced" after COMPLETE_DWELL minutes total on site.
 */

export type TrackingConfig = {
  enabled: boolean;
  geofence_meters: number;
  arrival_dwell_minutes: number;
  complete_dwell_minutes: number;
  departure_gap_minutes: number;
  ping_interval_seconds: number;
  max_accuracy_meters: number;
  retain_ping_days: number;
};

const DEFAULTS: TrackingConfig = {
  enabled: true,
  geofence_meters: 140,
  arrival_dwell_minutes: 4,
  complete_dwell_minutes: 10,
  departure_gap_minutes: 6,
  ping_interval_seconds: 60,
  max_accuracy_meters: 120,
  retain_ping_days: 30,
};

export async function getTrackingConfig(db = supabaseAdmin()): Promise<TrackingConfig> {
  const { data } = await db.from("system_config").select("value").eq("key", "tracking").maybeSingle();
  return { ...DEFAULTS, ...((data?.value as Partial<TrackingConfig>) ?? {}) };
}

/** Great-circle distance in meters. */
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Plain-English proof sentence, by service type. */
export function proofStatement(serviceSlug: string | null, serviceName: string | null, address: string, minutes: number, arrival: Date, departure: Date) {
  const verbs: Record<string, string> = {
    "weekly-mow": "Mowed the lawn",
    "biweekly-mow": "Mowed the lawn",
    aeration: "Aerated the lawn",
    "curb-strips": "Serviced the curb strips",
    cleanup: "Completed the seasonal cleanup",
    addons: "Completed landscaping work",
  };
  const verb = verbs[serviceSlug ?? ""] ?? (serviceName ? `Completed ${serviceName.toLowerCase()}` : "Completed the service");
  const t = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" });
  return `${verb} at ${address}. On site ${minutes} minutes (${t(arrival)}–${t(departure)}), confirmed by GPS.`;
}

type Ping = { lat: number; lng: number; accuracy?: number | null; recorded_at?: string };

/**
 * Process one position report for one person. Opens/extends/closes site visits,
 * flips job status, and writes proof — entirely server-side.
 */
export async function processPing(profileId: string, deviceId: string, ping: Ping) {
  const db = supabaseAdmin();
  const cfg = await getTrackingConfig(db);
  if (!cfg.enabled) return { skipped: "tracking_disabled" };

  // Ignore wildly imprecise fixes — they create false positives.
  if (ping.accuracy != null && ping.accuracy > cfg.max_accuracy_meters) {
    return { skipped: "low_accuracy", accuracy: ping.accuracy };
  }

  const now = ping.recorded_at ? new Date(ping.recorded_at) : new Date();
  const todayIso = now.toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  // Candidate properties = today's scheduled work with coordinates on file.
  const { data: jobs } = await db
    .from("jobs")
    .select("id, status, customer_id, property_id, service_id, arrival_at, scheduled_date, properties(id, address, lat, lng), services(name, slug), customers(full_name)")
    .eq("scheduled_date", todayIso)
    .neq("status", "canceled");

  let match: { job: any; meters: number } | null = null;
  for (const j of (jobs ?? []) as any[]) {
    const p = j.properties;
    if (!p?.lat || !p?.lng) continue;
    const m = metersBetween(ping.lat, ping.lng, p.lat, p.lng);
    if (m <= cfg.geofence_meters && (!match || m < match.meters)) match = { job: j, meters: m };
  }

  // Any open visit for this person that is NOT the matched property gets closed out.
  const { data: openVisits } = await db
    .from("site_visits")
    .select("id, job_id, property_id, customer_id, entered_at, last_seen_at, dwell_seconds, ping_count, closest_meters, avg_accuracy, auto_arrived, profile_id")
    .eq("profile_id", profileId)
    .eq("state", "open");

  for (const v of openVisits ?? []) {
    const isMatch = match && v.job_id === match.job.id;
    const goneMinutes = (now.getTime() - new Date(v.last_seen_at).getTime()) / 60000;
    if (!isMatch && goneMinutes >= cfg.departure_gap_minutes) {
      await closeVisit(v, cfg, now);
    }
  }

  if (!match) return { inside: false };

  const existing = (openVisits ?? []).find((v) => v.job_id === match!.job.id);

  if (!existing) {
    const { data: created } = await db
      .from("site_visits")
      .insert({
        job_id: match.job.id,
        property_id: match.job.property_id,
        customer_id: match.job.customer_id,
        profile_id: profileId,
        device_id: deviceId,
        entered_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        dwell_seconds: 0,
        ping_count: 1,
        closest_meters: match.meters,
        avg_accuracy: ping.accuracy ?? null,
        state: "open",
      })
      .select("id")
      .single();
    return { inside: true, visit: created?.id, dwell_minutes: 0, meters: Math.round(match.meters) };
  }

  // Extend the open visit.
  const dwell = Math.round((now.getTime() - new Date(existing.entered_at).getTime()) / 1000);
  const pings = (existing.ping_count ?? 1) + 1;
  const avgAcc =
    ping.accuracy != null
      ? ((existing.avg_accuracy ?? ping.accuracy) * (pings - 1) + ping.accuracy) / pings
      : existing.avg_accuracy;

  await db
    .from("site_visits")
    .update({
      last_seen_at: now.toISOString(),
      dwell_seconds: dwell,
      ping_count: pings,
      closest_meters: Math.min(existing.closest_meters ?? match.meters, match.meters),
      avg_accuracy: avgAcc,
    })
    .eq("id", existing.id);

  // Enough continuous presence to call it a real arrival.
  const dwellMin = dwell / 60;
  if (!existing.auto_arrived && dwellMin >= cfg.arrival_dwell_minutes) {
    await db.from("site_visits").update({ auto_arrived: true }).eq("id", existing.id);
    if (!match.job.arrival_at) {
      await db.from("jobs").update({ arrival_at: existing.entered_at, status: "in_progress" }).eq("id", match.job.id);
      await db.from("job_events").insert({
        job_id: match.job.id,
        type: "arrived",
        note: `Auto-detected on site (${Math.round(match.meters)}m, ${Math.round(dwellMin)} min)`,
        actor: "system",
      });
      await logAutomation({ trigger: "tracking.auto_arrival", ref_id: match.job.id, detail: { meters: Math.round(match.meters), dwell_minutes: Math.round(dwellMin) } });
    }
  }

  return { inside: true, visit: existing.id, dwell_minutes: Math.round(dwellMin), meters: Math.round(match.meters) };
}

/** Close a visit and, if it earned it, complete the job + write proof. */
export async function closeVisit(v: any, cfg: TrackingConfig, now = new Date()) {
  const db = supabaseAdmin();
  const departure = new Date(v.last_seen_at);
  const dwellSeconds = Math.round((departure.getTime() - new Date(v.entered_at).getTime()) / 1000);
  const minutes = Math.round(dwellSeconds / 60);

  const outcome =
    minutes >= cfg.complete_dwell_minutes ? "serviced" : minutes >= cfg.arrival_dwell_minutes ? "short_stop" : "drive_by";

  await db
    .from("site_visits")
    .update({
      state: "closed",
      exited_at: departure.toISOString(),
      dwell_seconds: dwellSeconds,
      outcome,
      auto_completed: outcome === "serviced",
    })
    .eq("id", v.id);

  if (outcome !== "serviced" || !v.job_id) {
    if (outcome === "drive_by") {
      await logAutomation({ trigger: "tracking.drive_by_ignored", ref_id: v.job_id ?? v.id, detail: { minutes } });
    }
    return { outcome, minutes };
  }

  // Full service confirmed — close the job and write the bookkeeping proof.
  const { data: job } = await db
    .from("jobs")
    .select("id, status, customer_id, property_id, properties(address), services(name, slug)")
    .eq("id", v.job_id)
    .maybeSingle();
  if (!job) return { outcome, minutes };

  const address = (job as any).properties?.address ?? "the property";
  const statement = proofStatement((job as any).services?.slug ?? null, (job as any).services?.name ?? null, address, minutes, new Date(v.entered_at), departure);

  if (job.status !== "completed") {
    await db.from("jobs").update({ departure_at: departure.toISOString(), status: "completed" }).eq("id", job.id);
    try {
      const { draftInvoiceForJob } = await import("@/lib/invoices");
      await draftInvoiceForJob(job.id);
    } catch {
      /* invoicing is best-effort; proof still stands */
    }
  }

  await db.from("service_proofs").insert({
    job_id: job.id,
    visit_id: v.id,
    customer_id: v.customer_id ?? job.customer_id,
    property_id: v.property_id ?? job.property_id,
    profile_id: v.profile_id,
    statement,
    arrival_at: v.entered_at,
    departure_at: departure.toISOString(),
    minutes_on_site: minutes,
    ping_count: v.ping_count,
    closest_meters: v.closest_meters,
    avg_accuracy: v.avg_accuracy,
    method: "gps_auto",
  });

  await db.from("job_events").insert({ job_id: job.id, type: "departed", note: statement, actor: "system" });
  await logAutomation({ trigger: "tracking.auto_completed", ref_id: job.id, detail: { minutes, statement } });

  return { outcome, minutes, statement };
}

/** Backstop sweeper: close any visit whose device stopped reporting. */
export async function sweepStaleVisits() {
  const db = supabaseAdmin();
  const cfg = await getTrackingConfig(db);
  const cutoff = new Date(Date.now() - cfg.departure_gap_minutes * 60000).toISOString();
  const { data: stale } = await db
    .from("site_visits")
    .select("id, job_id, property_id, customer_id, profile_id, entered_at, last_seen_at, dwell_seconds, ping_count, closest_meters, avg_accuracy")
    .eq("state", "open")
    .lt("last_seen_at", cutoff);

  const results = [];
  for (const v of stale ?? []) results.push(await closeVisit(v, cfg));
  return { closed: results.length, results };
}
