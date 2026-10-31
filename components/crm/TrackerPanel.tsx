"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Chip, EmptyState } from "@/components/ui";

type Exception = {
  id: number; type: string; severity: string; detail: string;
  occurred_on: string | null; created_at?: string | null; job_id?: string | null;
  crew: string | null; address: string | null;
  customer: string | null; customer_phone: string | null;
};

const TYPE_TITLE: Record<string, string> = {
  access_blocked: "Access blocked", yard_not_ready: "Yard not ready", crew_reported: "Crew reported",
  no_gps: "No GPS record", short_visit: "Visit too short", missed: "Missed visit", unverified: "Not verified",
};
const titleFor = (e: Exception) => `${TYPE_TITLE[e.type] ?? e.type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}${e.customer ? ` — ${e.customer.split(" ").slice(-1)[0]}` : ""}`;
const when = (e: Exception) => {
  const d = e.created_at ? new Date(e.created_at) : e.occurred_on ? new Date(e.occurred_on + "T12:00:00") : null;
  if (!d) return "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const day = d.toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const time = e.created_at ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }) : "";
  return `${day === today ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" })}${time ? ` · ${time}` : ""}`;
};
type CrewRow = {
  profile_id: string; full_name: string | null; crew: string | null;
  minutes_since_ping: number | null; at_address: string | null;
  minutes_on_site: number | null; jobs_today: number; jobs_done_today: number;
};
type DeviceRow = {
  device_id: string; full_name: string | null; model: string | null;
  os_version: string | null; app_version: string | null; permission_state: string | null;
  minutes_since_ping: number | null; pings_received: number; last_error: string | null; health: string;
};
type HealthRow = {
  day: string; jobs_scheduled: number; jobs_completed: number; gps_verified: number;
  verification_rate: number | null; avg_minutes_on_site: number | null; revenue_serviced: number | null;
};

// No urgency tiers on screen. The card border carries the one distinction
// that matters — does this need a person right now — and the label says so.
const SEV_BORDER: Record<string, string> = { critical: "border-coral/50", high: "border-gold/40" };
const SEV_LABEL: Record<string, string> = { critical: "Needs you", high: "Open", warn: "Open" };

const ago = (m: number | null) =>
  m == null ? "—" : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;

export function TrackerPanel({ exceptions, crew, devices, health }: {
  exceptions: Exception[]; crew: CrewRow[]; devices: DeviceRow[]; health: HealthRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"exceptions" | "crew" | "devices" | "history">("exceptions");
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");

  async function resolve(id: number) {
    setBusy(id); setErr("");
    const res = await fetch("/api/crm/exceptions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "failed");
    setBusy(null);
    router.refresh();
  }

  const tabs = [
    ["exceptions", "Exceptions", exceptions.length],
    ["crew", "Crew", crew.length],
    ["devices", "Devices", devices.length],
    ["history", "30-day", null],
  ] as const;

  return (
    <>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-[color:var(--border)] bg-black/30 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === k ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"
            }`}>
            {label}{n !== null && <span className={`ml-1.5 text-[11px] ${tab === k ? "text-[#0a0a0a]/60" : "text-[color:var(--faint)]"}`}>{n}</span>}
          </button>
        ))}
      </div>

      {err && <div className="mb-3 text-sm text-coral">{err}</div>}

      {tab === "exceptions" && (exceptions.length === 0 ? (
        <EmptyState icon="Exceptions" title="Queue is clear" hint="No open service exceptions." />
      ) : (
        <div className="space-y-2">
          {exceptions.map((e) => (
            <Card key={e.id} className={`p-4 ${SEV_BORDER[e.severity] ?? ""}`}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className={`mo-eyebrow ${e.severity === "critical" ? "text-coral" : "text-gold"}`}>{SEV_LABEL[e.severity] ?? "Open"}</span>
                <span className="mo-eyebrow">{when(e)}</span>
              </div>
              <Link href={`/crm/tracker/${e.id}`} className="block font-display text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink)] hover:text-teal">{titleFor(e)} <span className="text-[color:var(--faint)]">›</span></Link>
              <p className="mt-1 text-[14px] leading-snug text-[color:var(--body)]">
                {e.detail}{e.crew ? ` ${e.crew}.` : ""}{e.address ? ` ${e.address}.` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                {e.job_id && (
                  <Link href={`/crm/jobs/${e.job_id}`} className="flex-1 rounded-full border border-teal/50 py-2.5 text-center text-[14px] font-semibold text-[color:var(--ink)]">Reschedule</Link>
                )}
                <button onClick={() => resolve(e.id)} disabled={busy === e.id}
                  className="mo-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-50">
                  {busy === e.id ? "…" : "Resolve"}
                </button>
              </div>
            </Card>
          ))}
        </div>
      ))}

      {tab === "crew" && (crew.length === 0 ? (
        <EmptyState icon="Crew" title="No active crew devices" hint="Nobody has the crew app installed and reporting yet." />
      ) : (
        <div className="space-y-2">
          {crew.map((c) => {
            const live = c.minutes_since_ping != null && c.minutes_since_ping < 30;
            return (
              <Card key={c.profile_id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-[color:var(--ink)]">
                    {c.full_name ?? "Crew member"}{c.crew ? ` · ${c.crew}` : ""}
                  </div>
                  <div className="text-sm text-[color:var(--body)]">
                    {c.at_address ? `On site: ${c.at_address}${c.minutes_on_site != null ? ` (${c.minutes_on_site} min)` : ""}` : "Not on a property"}
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--faint)]">
                    Last ping {ago(c.minutes_since_ping)} · {c.jobs_done_today}/{c.jobs_today} done today
                  </div>
                </div>
                <Chip className={live ? "border border-teal/60 text-teal" : "border border-coral/60 text-coral"}>{live ? "Live" : "Dark"}</Chip>
              </Card>
            );
          })}
        </div>
      ))}

      {tab === "devices" && (devices.length === 0 ? (
        <EmptyState icon="Devices" title="No devices enrolled" hint="Install Momentum Crew and sign in to enrol a phone." />
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <Card key={d.device_id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[color:var(--ink)]">{d.full_name ?? "—"}</div>
                <div className="text-sm text-[color:var(--body)]">
                  {d.model ?? "unknown device"} · iOS {d.os_version ?? "?"} · app {d.app_version ?? "?"}
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--faint)]">
                  Permission: {d.permission_state ?? "none"} · last ping {ago(d.minutes_since_ping)} · {d.pings_received} pings
                  {d.last_error ? ` · ${d.last_error}` : ""}
                </div>
              </div>
              {d.health === "healthy"
                ? <Chip className="border border-sage/60 text-sage">OK</Chip>
                : <Chip className="border border-gold/60 text-gold">Fix</Chip>}
            </Card>
          ))}
        </div>
      ))}

      {tab === "history" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] mo-eyebrow text-left text-[color:var(--faint)]">
                <th className="px-4 py-3">Day</th><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Verified</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Avg min</th><th className="px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {health.filter((h) => h.jobs_scheduled > 0).map((h) => (
                <tr key={h.day} className="border-b border-[color:var(--border)] last:border-0">
                  <td className="px-4 py-2.5 text-navy dark:text-ice">{h.day}</td>
                  <td className="px-4 py-2.5 text-[color:var(--body)]">{h.jobs_scheduled}</td>
                  <td className="px-4 py-2.5 text-[color:var(--body)]">{h.jobs_completed}</td>
                  <td className="px-4 py-2.5 text-[color:var(--body)]">{h.gps_verified}</td>
                  <td className="px-4 py-2.5 text-[color:var(--body)]">{h.verification_rate != null ? `${h.verification_rate}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-[color:var(--body)]">{h.avg_minutes_on_site ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[color:var(--body)]">{h.revenue_serviced != null ? `$${h.revenue_serviced}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
