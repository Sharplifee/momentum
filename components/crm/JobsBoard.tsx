"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Job = { id: string; scheduled_date: string; status: string; price: number | null; crew_id: number | null; zone_id: number | null; weather_flag: boolean; window_start: string | null; properties: { address: string; city: string | null } | null; services: { name: string } | null; customers: { full_name: string } | null; margin?: number | null };

export function JobsBoard({ jobs, crews, zones, weekStart, pushZones }: { jobs: Job[]; crews: { id: number; name: string }[]; zones: { id: number; name: string }[]; weekStart: string; pushZones: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const days = Array.from({ length: 7 }, (_, i) => new Date(new Date(weekStart).getTime() + i * 86400_000).toISOString().slice(0, 10));

  async function patchJob(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    await fetch("/api/crm/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", job_id: id, patch }) });
    setBusy("");
    router.refresh();
  }
  async function pushDay() {
    setBusy("push");
    await fetch("/api/crm/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "push_day", zones: pushZones!.split(",").map(Number), date: weekStart }) });
    setBusy("");
    router.push("/crm/jobs");
    router.refresh();
  }

  return (
    <div>
      {pushZones && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm dark:border-gold/40">
          Rain risk in zone(s) {pushZones}. <button onClick={pushDay} disabled={busy === "push"} className="ml-2 rounded-lg bg-gold px-3 py-1 font-semibold text-white">{busy === "push" ? "Pushing…" : "Push these jobs +1 day"}</button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => (
          <div key={d} className="mo-card p-2">
            <div className="mb-2 text-center text-xs font-semibold text-slate">{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}</div>
            {jobs.filter((j) => j.scheduled_date === d).map((j) => (
              <div key={j.id} className={`mb-2 rounded-lg border p-2 text-xs ${j.weather_flag ? "border-gold/50 bg-gold/10" : "border-[color:var(--border)]"}`}>
                <div className="font-medium">{j.customers?.full_name ?? j.properties?.address ?? "job"}</div>
                <div className="text-slate">{j.services?.name} · {j.status}{j.weather_flag ? " ☔" : ""}{j.margin != null ? ` · margin $${j.margin.toFixed(0)}` : ""}</div>
                <select value={j.crew_id ?? ""} disabled={busy === j.id}
                  onChange={(e) => patchJob(j.id, { crew_id: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-[color:var(--border)] text-xs dark:border-[color:var(--border)] dark:bg-white/10">
                  <option value="">unassigned</option>
                  {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="date" defaultValue={j.scheduled_date} disabled={busy === j.id}
                  onBlur={(e) => e.target.value !== j.scheduled_date && patchJob(j.id, { scheduled_date: e.target.value })}
                  className="mt-1 w-full rounded border border-[color:var(--border)] text-xs dark:border-[color:var(--border)] dark:bg-white/10" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
