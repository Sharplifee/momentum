"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Chip, EmptyState } from "@/components/ui";

type Exception = {
  id: number; type: string; severity: string; detail: string;
  occurred_on: string | null; crew: string | null; address: string | null;
  customer: string | null; customer_phone: string | null;
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

const SEV: Record<string, string> = {
  critical: "bg-red/15 text-red",
  high: "bg-gold/25 text-[oklch(0.45_0.10_70)] dark:text-gold",
  warn: "bg-ice/25 text-navy dark:text-ice",
};

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
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
              tab === k ? "bg-teal/15 text-navy ring-1 ring-teal/40 dark:text-ice" : "text-slate hover:bg-ice/15"
            }`}>
            {label}{n !== null && <span className="ml-1.5 text-xs text-slate/60">{n}</span>}
          </button>
        ))}
      </div>

      {err && <div className="mb-3 text-sm text-red">{err}</div>}

      {tab === "exceptions" && (exceptions.length === 0 ? (
        <EmptyState icon="✅" title="Queue is clear" hint="No open service exceptions." />
      ) : (
        <div className="space-y-2">
          {exceptions.map((e) => (
            <Card key={e.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Chip className={SEV[e.severity] ?? SEV.warn}>{e.severity}</Chip>
                  <span className="text-xs text-slate">{e.type.replace(/_/g, " ")}</span>
                  {e.occurred_on && <span className="text-xs text-slate/60">{e.occurred_on}</span>}
                </div>
                <div className="text-sm font-medium text-navy dark:text-ice">{e.detail}</div>
                {(e.customer || e.address) && (
                  <div className="mt-0.5 text-sm text-slate">
                    {[e.customer, e.address].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button onClick={() => resolve(e.id)} disabled={busy === e.id}
                className="shrink-0 rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-1.5 text-xs font-medium text-navy transition hover:bg-white disabled:opacity-50 dark:bg-white/10 dark:text-ice">
                {busy === e.id ? "…" : "Resolve"}
              </button>
            </Card>
          ))}
        </div>
      ))}

      {tab === "crew" && (crew.length === 0 ? (
        <EmptyState icon="🧭" title="No active crew devices" hint="Nobody has the crew app installed and reporting yet." />
      ) : (
        <div className="space-y-2">
          {crew.map((c) => {
            const live = c.minutes_since_ping != null && c.minutes_since_ping < 30;
            return (
              <Card key={c.profile_id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy dark:text-ice">
                    {c.full_name ?? "Crew member"}{c.crew ? ` · ${c.crew}` : ""}
                  </div>
                  <div className="text-sm text-slate">
                    {c.at_address ? `On site: ${c.at_address}${c.minutes_on_site != null ? ` (${c.minutes_on_site} min)` : ""}` : "Not on a property"}
                  </div>
                  <div className="mt-0.5 text-xs text-slate/70">
                    Last ping {ago(c.minutes_since_ping)} · {c.jobs_done_today}/{c.jobs_today} done today
                  </div>
                </div>
                <Chip className={live ? "bg-teal/20 text-teal" : "bg-red/15 text-red"}>{live ? "Live" : "Dark"}</Chip>
              </Card>
            );
          })}
        </div>
      ))}

      {tab === "devices" && (devices.length === 0 ? (
        <EmptyState icon="📱" title="No devices enrolled" hint="Install Momentum Crew and sign in to enrol a phone." />
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <Card key={d.device_id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-navy dark:text-ice">{d.full_name ?? "—"}</div>
                <div className="text-sm text-slate">
                  {d.model ?? "unknown device"} · iOS {d.os_version ?? "?"} · app {d.app_version ?? "?"}
                </div>
                <div className="mt-0.5 text-xs text-slate/70">
                  Permission: {d.permission_state ?? "none"} · last ping {ago(d.minutes_since_ping)} · {d.pings_received} pings
                  {d.last_error ? ` · ${d.last_error}` : ""}
                </div>
              </div>
              <Chip className={d.health === "healthy" ? "bg-teal/20 text-teal" : d.health === "dark" ? "bg-red/15 text-red" : "bg-gold/25 text-[oklch(0.45_0.10_70)] dark:text-gold"}>
                {d.health.replace(/_/g, " ")}
              </Chip>
            </Card>
          ))}
        </div>
      ))}

      {tab === "history" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-slate/60">
                <th className="px-4 py-3">Day</th><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Verified</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Avg min</th><th className="px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {health.filter((h) => h.jobs_scheduled > 0).map((h) => (
                <tr key={h.day} className="border-b border-[color:var(--border)] last:border-0">
                  <td className="px-4 py-2.5 text-navy dark:text-ice">{h.day}</td>
                  <td className="px-4 py-2.5 text-slate">{h.jobs_scheduled}</td>
                  <td className="px-4 py-2.5 text-slate">{h.jobs_completed}</td>
                  <td className="px-4 py-2.5 text-slate">{h.gps_verified}</td>
                  <td className="px-4 py-2.5 text-slate">{h.verification_rate != null ? `${h.verification_rate}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-slate">{h.avg_minutes_on_site ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate">{h.revenue_serviced != null ? `$${h.revenue_serviced}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
