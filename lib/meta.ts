import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type CapiEventInput = {
  event_name: "Lead" | "Schedule" | "InitiateCheckout" | "Purchase" | "PageView";
  event_id: string; // dedupe key — pass the row id (lead/job/etc) so pixel + CAPI collapse into one event
  event_source_url?: string;
  action_source?: "website" | "system_generated" | "phone_call";
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  value?: number;
  currency?: string;
  lead_id?: string | null;
  job_id?: string | null;
  client_ip?: string;
  client_user_agent?: string;
  external_id?: string | null;
};

/** Graph API version. v26.0 shipped 2026-07-29; v21.0 deprecates 2027-01-21.
 *  Env-overridable so the next bump is a config change, not a redeploy. */
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";

/** Meta wants fbc in the form fb.<subdomainIndex>.<creationTime>.<fbclid>. */
export function deriveFbc(fbc?: string | null, fbclid?: string | null): string | null {
  if (fbc) return fbc;
  if (!fbclid) return null;
  return `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`;
}

/**
 * Sends a server-side event to Meta's Conversions API, hashing PII per spec,
 * and logs the attempt + response to meta_events (event_id has a unique
 * constraint so this call is naturally idempotent — a retry just no-ops).
 */
export async function sendMetaCapiEvent(input: CapiEventInput) {
  const db = supabaseAdmin();
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  const userData: Record<string, unknown> = {};
  if (input.email) userData.em = [sha256(input.email)];
  if (input.phone) userData.ph = [sha256(input.phone.replace(/[^\d]/g, ""))];
  if (input.fbp) userData.fbp = input.fbp;
  if (input.client_ip) userData.client_ip_address = input.client_ip;
  if (input.client_user_agent) userData.client_user_agent = input.client_user_agent;
  const fbc = deriveFbc(input.fbc, input.fbclid);
  if (fbc) userData.fbc = fbc;
  // external_id is a free, high-weight match signal — a stable hashed id we own.
  if (input.external_id) userData.external_id = [sha256(input.external_id)];

  const payload = {
    data: [
      {
        event_name: input.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.event_id,
        event_source_url: input.event_source_url,
        action_source: input.action_source ?? "website",
        user_data: userData,
        custom_data: input.value
          ? { value: input.value, currency: input.currency ?? "USD" }
          : undefined,
      },
    ],
  };

  let response: unknown = null;
  let ok = false;
  try {
    if (!pixelId || !token) {
      throw new Error("META_PIXEL_ID or META_CAPI_TOKEN not configured");
    }
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    response = await res.json();
    ok = res.ok;
  } catch (err) {
    response = { error: err instanceof Error ? err.message : String(err) };
  }

  // event_id is UNIQUE — on a duplicate dispatch this insert throws 23505 and we swallow it,
  // which is the intended dedupe behavior (pixel fired the same event_id client-side already).
  const { error: dbError } = await db.from("meta_events").insert({
    event_name: input.event_name,
    event_id: input.event_id,
    lead_id: input.lead_id ?? null,
    job_id: input.job_id ?? null,
    payload,
    response,
  });

  if (dbError && dbError.code !== "23505") {
    console.error("meta_events insert failed", dbError);
  }

  return { ok, response };
}
