import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAutomation } from "@/lib/automation";

/**
 * Autonomous service verification (v2).
 *
 *   45m geofence — a lot plus street parking; the neighbour two doors down is outside.
 *   10 minutes continuous presence = ARRIVAL and SERVICE START (one trigger).
 *   Time on site is measured from there as a crew-efficiency metric.
 *   Departure fires on EITHER: outside the fence 10 continuous minutes, OR >400m away
 *   (immediate — nobody mows a lawn from a quarter mile).
 *   Fixes worse than 60m accuracy are discarded, not guessed with.
 */

export type TrackingConfig = {
  enabled: boolean;
  geofence_meters: number;
  service_start_minutes: number;
  departure_gap_minutes: number;
  departure_distance_meters: number;
  ping_interval_seconds: number;
  max_accuracy_meters: number;
  ambiguity_meters: number;
  retain_ping_days: number;
};

const DEFAULTS: TrackingConfig = {
  enabled: true,
  geofence_meters: 45,
  service_start_minutes: 10,
  departure_gap_minutes: 10,
  departure_distance_meters: 400,
  ping_interval_seconds: 60,
  max_accuracy_meters: 60,
  ambiguity_meters: 25,
  retain_ping_days: 30,
};

export async function getTrackingConfig(db = supabaseAdmin()): Promise<TrackingConfig> {
  const { data } = await db.from("system_config").select("value").eq("key", "tracking").maybeSingle();
  return { ...DEFAULTS, ...((data?.value as Partial<TrackingConfig>) ?? {}) };
}

export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function proofStatement(
  serviceSlug: string | null, serviceName: string | null, address: string,
  minutes: number, arrival: Date, departure: Date
) {
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
  return `${verb} at ${address}. On site ${minutes} minutes (${t(arrival)}-${t(departure)}), confirmed by GPS.`;
}

type Ping = { lat: number; lng: number; accuracy?: number | null; recorded_at?: string };

export async function processPing(profileId: string, deviceId: string, ping: Ping) {
  const db = supabaseAdmin();
  const cfg = await getTrackingConfig(db);
  if (!cfg.enabled) return { skipped: "tracking_disabled" };
  if (ping.accuracy != null && ping.accuracy > cfg.max_accuracy_meters) {
    return { skipped: "low_accuracy", accuracy: Math.round(ping.accuracy) };
  }

  const now = ping.recorded_at ? new Date(ping.recorded_at) : new Date();
  const todayIso = now.toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  const { data: jobs } = await db
    .from("jobs")
    .select("id, status, customer_id, property_id, arrival_at, properties(id, address, lat, lng), services(name, slug)")
    .eq("scheduled_date", todayIso)
    .neq("status", "canceled");

  const ranked = ((jobs ?? []) as any[])
    .filter((j) => j.properties?.lat && j.properties?.lng)
    .map((j) => ({ job: j, meters: metersBetween(ping.lat, ping.lng, j.properties.lat, j.properties.lng) }))
    .sort((a, b) => a.meters - b.meters);

  const inside = ranked.filter((r) => r.meters <= cfg.geofence_meters);
  const match = inside[0] ?? null;
  const ambiguous = inside.length > 1 && inside[1].meters - inside[0].meters < cfg.ambiguity_meters;

  const { data: openVisits } = await db
    .from("site_visits")
    .select("id, job_id, property_id, customer_id, entered_at, last_seen_at, dwell_seconds, ping_count, closest_meters, avg_accuracy, auto_arrived, profile_id")
    .eq("profile_id", profileId)
    .eq("state", "open");

  for (const v of openVisits ?? []) {
    if (match && v.job_id === match.job.id) continue;
    const gapMinutes = (now.getTime() - new Date(v.last_seen_at).getTime()) / 60000;
    const vJob = ranked.find((r) => r.job.id === v.job_id);
    const farAway = vJob ? vJob.meters > cfg.departure_distance_meters : false;
    if (farAway || gapMinutes >= cfg.departure_gap_minutes) {
      await closeVisit(v, cfg, farAway ? "distance" : "gap");
    }
  }

  if (!match) return { inside: false, nearest_meters: ranked[0] ? Math.round(ranked[0].meters) : null };

  const existing = (openVisits ?? []).find((v) => v.job_id === match.job.id);

  if (!existing) {
    const { data: created } = await db.from("site_visits").insert({
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
      outcome: ambiguous ? "ambiguous_location" : null,
    }).select("id").single();
    return { inside: true, visit: created?.id, minutes_present: 0, meters: Math.round(match.meters), ambiguous };
  }

  const presentSeconds = Math.round((now.getTime() - new Date(existing.entered_at).getTime()) / 1000);
  const pings = (existing.ping_count ?? 1) + 1;
  const avgAcc = ping.accuracy != null
    ? ((existing.avg_accuracy ?? ping.accuracy) * (pings - 1) + ping.accuracy) / pings
    : existing.avg_accuracy;

  await db.from("site_visits").update({
    last_seen_at: now.toISOString(),
    dwell_seconds: presentSeconds,
    ping_count: pings,
    closest_meters: Math.min(existing.closest_meters ?? match.meters, match.meters),
    avg_accuracy: avgAcc,
  }).eq("id", existing.id);

  const minutes = presentSeconds / 60;
  if (!existing.auto_arrived && minutes >= cfg.service_start_minutes) {
    await db.from("site_visits").update({ auto_arrived: true }).eq("id", existing.id);
    if (!match.job.arrival_at) {
      await db.from("jobs").update({ arrival_at: existing.entered_at, status: "in_progress" }).eq("id", match.job.id);
      await db.from("job_events").insert({
        job_id: match.job.id,
        type: "arrived",
        note: "Service started - " + cfg.service_start_minutes + " min continuous presence within " + Math.round(match.meters) + "m" + (ambiguous ? " (adjacent property ambiguity flagged)" : ""),
        actor: "system",
      });
      await logAutomation({ trigger: "tracking.service_started", ref_id: match.job.id, detail: { meters: Math.round(match.meters), ambiguous } });
    }
  }

  return { inside: true, visit: existing.id, minutes_present: Math.round(minutes), meters: Math.round(match.meters), started: minutes >= cfg.service_start_minutes };
}

export async function closeVisit(v: any, cfg: TrackingConfig, reason: "gap" | "distance" | "sweep" = "gap") {
  const db = supabaseAdmin();
  const departure = new Date(v.last_seen_at);
  const seconds = Math.round((departure.getTime() - new Date(v.entered_at).getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const serviced = minutes >= cfg.service_start_minutes;

  await db.from("site_visits").update({
    state: "closed",
    exited_at: departure.toISOString(),
    dwell_seconds: seconds,
    outcome: serviced ? "serviced" : minutes >= 2 ? "brief_stop" : "drive_by",
    auto_completed: serviced,
  }).eq("id", v.id);

  if (!serviced || !v.job_id) {
    await logAutomation({ trigger: "tracking.not_serviced", ref_id: v.job_id ?? v.id, detail: { minutes, reason } });
    return { outcome: "not_serviced", minutes };
  }

  const { data: job } = await db
    .from("jobs")
    .select("id, status, customer_id, property_id, properties(address), services(name, slug)")
    .eq("id", v.job_id).maybeSingle();
  if (!job) return { outcome: "serviced", minutes };

  const address = (job as any).properties?.address ?? "the property";
  const statement = proofStatement(
    (job as any).services?.slug ?? null, (job as any).services?.name ?? null,
    address, minutes, new Date(v.entered_at), departure
  );

  if (job.status !== "completed") {
    await db.from("jobs").update({ departure_at: departure.toISOString(), status: "completed" }).eq("id", job.id);
    try {
      const { draftInvoiceForJob } = await import("@/lib/invoices");
      await draftInvoiceForJob(job.id);
    } catch { /* proof stands regardless */ }
  }

  await db.from("service_proofs").insert({
    job_id: job.id, visit_id: v.id,
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

  await db.from("job_events").insert({ job_id: job.id, type: "departed", note: statement + " (departure via " + reason + ")", actor: "system" });
  await logAutomation({ trigger: "tracking.auto_completed", ref_id: job.id, detail: { minutes, reason, statement } });

  return { outcome: "serviced", minutes, statement };
}

export async function sweepStaleVisits() {
  const db = supabaseAdmin();
  const cfg = await getTrackingConfig(db);
  const cutoff = new Date(Date.now() - cfg.departure_gap_minutes * 60000).toISOString();
  const { data: stale } = await db
    .from("site_visits")
    .select("id, job_id, property_id, customer_id, profile_id, entered_at, last_seen_at, dwell_seconds, ping_count, closest_meters, avg_accuracy")
    .eq("state", "open").lt("last_seen_at", cutoff);
  const results = [];
  for (const v of stale ?? []) results.push(await closeVisit(v, cfg, "sweep"));
  return { closed: results.length, results };
}
