import { supabaseAdmin } from "@/lib/supabase/admin";
import { GRAPH_VERSION } from "@/lib/meta";
import { logAutomation } from "@/lib/automation";

/**
 * One path for every Meta instant-form lead, whether it arrives by webhook or
 * by the poll cron. Dedupes on leads.meta_lead_id, so the two can overlap
 * safely. `backfill` records the lead without texting it (used for leads that
 * are already days old and may be mid-conversation with the crew).
 */

type Graphlead = {
  id: string;
  field_data: Array<{ name: string; values: string[] }>;
  created_time?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  platform?: string;
};

const DAY: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const WINDOW: Record<string, string> = {
  "12_2": "12 PM - 2 PM", "2_4": "2 PM - 4 PM", "4_6": "4 PM - 6 PM", "6_8": "6 PM - 8 PM",
};

function values(fd: Graphlead["field_data"], names: string[]): string[] {
  for (const f of fd ?? []) if (names.includes(f.name)) return (f.values ?? []).filter(Boolean);
  const hit = (fd ?? []).find((f) => names.some((n) => f.name.toLowerCase().includes(n)));
  return (hit?.values ?? []).filter(Boolean);
}
const one = (fd: Graphlead["field_data"], names: string[]) => values(fd, names).join(" ").trim() || undefined;

export async function fetchMetaLead(leadgenId: string, token: string): Promise<Graphlead> {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}` +
    `?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id,platform&access_token=${token}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(`graph ${res.status}: ${JSON.stringify(body?.error ?? body)}`);
  return body as Graphlead;
}

export async function ingestMetaLead(
  lead: Graphlead,
  opts: { base: string; backfill?: boolean; via: "webhook" | "poll" | "backfill" }
): Promise<{ ok: boolean; lead_id?: string; skipped?: string }> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("leads").select("id").eq("meta_lead_id", lead.id).maybeSingle();
  if (existing) return { ok: true, lead_id: existing.id, skipped: "already_in_crm" };

  const fd = lead.field_data;
  const full_name =
    one(fd, ["full_name", "name"]) ??
    [one(fd, ["first_name"]), one(fd, ["last_name"])].filter(Boolean).join(" ").trim();
  const phone = one(fd, ["phone_number", "phone"]);
  const address = one(fd, ["address", "street_address", "street"]);
  const email = one(fd, ["email"]);
  const rawWindow = one(fd, ["requested_window", "window", "time"]);
  const requested_window = rawWindow ? WINDOW[rawWindow] ?? rawWindow : undefined;
  const requested_days = values(fd, ["days"]).map((d) => DAY[d] ?? d);
  const service_interest = one(fd, ["service", "service_interest"]);

  if (!full_name || !phone || !address) {
    await logAutomation({ trigger: "meta.leadgen.incomplete", ref_id: lead.id, status: "error", detail: { via: opts.via } });
    return { ok: false, skipped: "missing_required_fields" };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.CRON_SECRET}`,
    "x-momentum-source": "meta_lead_ad",
  };
  if (opts.backfill) headers["x-momentum-backfill"] = "1";

  const res = await fetch(`${opts.base}/api/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      full_name, phone, address,
      email: email ?? undefined,
      requested_window,
      requested_days: requested_days.length ? requested_days : undefined,
      service_interest,
      meta_lead_id: lead.id,
      meta_created_time: lead.created_time,
      utm: { source: "meta", medium: "paid_social", campaign: lead.campaign_id, content: lead.ad_id, term: lead.adset_id },
      landing_page: `meta:${lead.platform ?? "facebook"}/form/${lead.form_id ?? "unknown"}`,
      referrer: "meta_lead_ad",
    }),
  });
  const out = await res.json().catch(() => ({}));
  await logAutomation({
    trigger: "meta.leadgen.received",
    ref_id: out?.lead_id ?? lead.id,
    status: res.ok ? "ok" : "error",
    detail: { via: opts.via, leadgen_id: lead.id, form_id: lead.form_id, ad_id: lead.ad_id, campaign_id: lead.campaign_id, backfill: !!opts.backfill },
  });
  return { ok: res.ok, lead_id: out?.lead_id };
}

export async function loadLeadgenConfig(): Promise<{ page_access_token?: string; verify_token?: string; app_secret?: string; page_id?: string }> {
  const { data } = await supabaseAdmin().from("system_config").select("value").eq("key", "meta_leadgen").maybeSingle();
  return (data?.value ?? {}) as never;
}
