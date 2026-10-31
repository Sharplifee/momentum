import { requireStaff } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { todayDenver, TZ } from "@/lib/day";
import { SmsStatusPanel } from "@/components/crm/settings/SmsStatusPanel";

export const dynamic = "force-dynamic";

/** Midnight in Denver for a YYYY-MM-DD day, as an ISO instant (handles MST/MDT). */
function denverDayStart(day: string): string {
  for (const off of ["-06:00", "-07:00"]) {
    const d = new Date(`${day}T00:00:00${off}`);
    const hh = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d);
    if (hh === "00" || hh === "24") return d.toISOString();
  }
  return new Date(`${day}T00:00:00-07:00`).toISOString();
}

/**
 * SMS & texting: the provider's live state (fetched in the browser from
 * /api/health so the page never caches a stale "ok"), plus today's counts from
 * sms_events. Nothing here is inferred from a key being present.
 */
export default async function SmsStatusPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  // sms_events has RLS on with no read policy, so the signed-in client sees
  // nothing and the page would report 0 / — forever. This screen is owner-only
  // (checked above), so the provider log is read with the service client.
  const events = supabaseAdmin();
  const today = todayDenver();
  const since = denverDayStart(today);
  const count = (types: string[]) => events.from("sms_events").select("id", { count: "exact", head: true }).in("event_type", types).gte("created_at", since);
  const [{ data: config }, { data: cl }, sent, delivered, failed, { data: lastIn }, { data: lastOut }, { count: optOuts }] = await Promise.all([
    db.from("system_config").select("key, value, updated_at").in("key", ["sms_sandbox", "sms_provider", "quiet_hours"]),
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
    count(["send_attempted"]),
    count(["sms_delivered"]),
    count(["send_failed", "sms_failed"]),
    events.from("sms_events").select("created_at").in("event_type", ["inbound", "sms_inbound"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    events.from("sms_events").select("created_at").eq("event_type", "send_attempted").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("customers").select("id", { count: "exact", head: true }).eq("sms_opt_out", true),
  ]);
  const cfg = (k: string) => (config ?? []).find((c) => c.key === k);
  const sandbox = (cfg("sms_sandbox")?.value ?? null) as { enabled?: boolean; redirect_all_to?: string; dry_run_default?: boolean } | null;
  const items = ((cl?.value as any)?.items ?? []) as { id?: string; label: string; done: boolean }[];
  const pick = (id: string) => items.find((i) => i.id === id) ?? null;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "Settings", href: "/crm/settings" }, { label: "SMS & texting", href: "/crm/settings/sms" }]} title="SMS & texting"
          sub="Whether texts are actually leaving. Checked live against the provider every time this opens." />
        <SmsStatusPanel
          provider={String(cfg("sms_provider")?.value ?? "—")}
          sandbox={sandbox}
          sandboxUpdated={cfg("sms_sandbox")?.updated_at ?? null}
          quiet={(cfg("quiet_hours")?.value as any) ?? null}
          counts={{ sent: sent.count ?? 0, delivered: delivered.count ?? 0, failed: failed.count ?? 0 }}
          lastInbound={lastIn?.created_at ?? null}
          lastOutbound={lastOut?.created_at ?? null}
          optOuts={optOuts ?? 0}
          checklist={[pick("sms_outbound"), pick("sms_inbound_signature")].filter(Boolean) as { id?: string; label: string; done: boolean }[]}
        />
      </div>
    </Shell>
  );
}
