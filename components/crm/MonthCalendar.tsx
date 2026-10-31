"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Job = {
  kind?: string;
  id: string;
  scheduled_date: string;
  status: string;
  window_start: string | null;
  crew_id: number | null;
  weather_flag: boolean | null;
  customer: string;
  address: string;
  service: string;
};
type Crew = { id: number; name: string; max_daily_jobs: number };

const CREW_DOT: Record<number, string> = { 1: "bg-teal", 2: "bg-teal", 3: "bg-teal" };
const CREW_TEXT: Record<number, string> = { 1: "text-teal", 2: "text-ice", 3: "text-gold" };
const STATUS_PILL: Record<string, string> = {
  scheduled: "border border-white/10 text-[color:var(--body)]",
  in_progress: "border border-teal/60 text-teal",
  completed: "border border-sage/60 text-sage",
  exception: "border border-gold/60 text-gold",
  cancelled: "border border-white/10 text-[color:var(--body)] line-through",
};

function ymd(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Denver" });
}

export function MonthCalendar({ month, jobs, crews, todayIso, basePath = "/crm/schedule?", action, selectedIso }: {
  month: string; jobs: Job[]; crews: Crew[]; todayIso: string; basePath?: string; action?: React.ReactNode; selectedIso?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(selectedIso ?? null);
  const [busy, setBusy] = useState<string | null>(null);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // Monday-start grid
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return d;
  }), [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      if (!map.has(j.scheduled_date)) map.set(j.scheduled_date, []);
      map.get(j.scheduled_date)!.push(j);
    }
    for (const list of map.values()) list.sort((a, b) => (a.window_start ?? "").localeCompare(b.window_start ?? ""));
    return map;
  }, [jobs]);

  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const capTotal = crews.reduce((s, c) => s + (c.max_daily_jobs ?? 0), 0);

  async function updateJob(jobId: string, patch: Record<string, unknown>) {
    setBusy(jobId);
    const res = await fetch("/api/crm/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", job_id: jobId, patch }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error === "day_full" ? "That day is at capacity for this crew." : "Couldn't save — try again.");
      return;
    }
    router.refresh();
  }

  const dayJobs = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="flex flex-col gap-4 2xl:flex-row">
      {/* month grid */}
      <div className="mo-card flex-1 p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <Link href={`${basePath}m=${prev}`} className="grid h-8 w-8 place-items-center rounded-full text-lg text-[color:var(--body)] transition hover:bg-white/[0.06] hover:text-[color:var(--ink)]">‹</Link>
            <Link href={`${basePath}m=${next}`} className="grid h-8 w-8 place-items-center rounded-full text-lg text-[color:var(--body)] transition hover:bg-white/[0.06] hover:text-[color:var(--ink)]">›</Link>
          </div>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{monthLabel}</h2>
          {action ?? (
            <Link href={`${basePath}m=${todayIso.slice(0,7)}`} onClick={() => setSelected(todayIso)} className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[12px] font-medium text-[color:var(--ink)] transition hover:border-white/30">Today</Link>
          )}
        </div>

        <div className="mo-eyebrow grid grid-cols-7 pb-2 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const iso = ymd(new Date(d.getTime() + 12 * 3600_000));
            const inMonth = d.getUTCMonth() === m - 1;
            const isToday = iso === todayIso;
            const list = byDay.get(iso) ?? [];
            const isSel = selected === iso;
            return (
              <button
                key={i}
                onClick={() => setSelected(iso)}
                className={`relative flex min-h-[76px] flex-col items-stretch gap-1 border-b border-r border-[color:var(--border)] p-1.5 text-left transition sm:min-h-[104px] ${i % 7 === 0 ? "border-l" : ""} ${i < 7 ? "border-t" : ""} ${isSel ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"} ${inMonth ? "" : "opacity-40"}`}
              >
                <span className={`self-start rounded-full text-[13px] leading-none ${isToday ? "grid h-6 w-6 place-items-center bg-[color:var(--ink)] font-semibold text-[#0a0a0a]" : "px-1 pt-0.5 font-medium text-[color:var(--ink)]"}`}>
                  {d.getUTCDate()}
                </span>
                <div className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((j) => (
                    <span key={j.id} className="flex items-center gap-1 truncate rounded-md bg-white/[0.06] px-1 py-0.5 text-[11px] leading-tight text-[color:var(--ink)]">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${j.kind === "quote" ? "bg-gold" : (CREW_DOT[j.crew_id ?? 0] ?? "bg-slate")}`} />
                      <span className="truncate">{j.customer}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[10px] font-medium text-[color:var(--body)]">+{list.length - 3} more</span>}
                </div>
                {list.length > 0 && (
                  <div className="flex flex-wrap content-start gap-1 px-0.5 sm:hidden">
                    {list.slice(0, 6).map((j) => (
                      <span key={j.id} className={`h-1.5 w-1.5 rounded-full ${j.kind === "quote" ? "bg-gold" : (CREW_DOT[j.crew_id ?? 0] ?? "bg-slate")}`} />
                    ))}
                    {list.length > 6 && <span className="text-[9px] font-semibold leading-none text-[color:var(--body)]">+{list.length - 6}</span>}
                  </div>
                )}
                {list.length > 0 && capTotal > 0 && (
                  <span className={`absolute bottom-1 right-1.5 hidden text-[9px] font-semibold sm:block mo-mono ${list.length >= capTotal ? "text-red" : "text-[color:var(--faint)]"}`}>
                    {list.length}/{capTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* day panel — the day IS the route */}
      <div className="mo-card w-full shrink-0 p-4 2xl:w-[320px]">
        {!selected ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <span className="mo-eyebrow">Day view</span>
            <p className="text-sm text-[color:var(--body)]">Select a day to see its schedule and route.</p>
          </div>
        ) : (
          <>
            <h3 className="mb-1 font-display text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
              {new Date(selected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            <p className="mb-3 text-xs text-[color:var(--body)]">{dayJobs.length ? `${dayJobs.length} stop${dayJobs.length === 1 ? "" : "s"} — in route order` : "No jobs scheduled."}</p>
            {dayJobs.some((j) => j.weather_flag) && (
              <Link href={`/crm/schedule/hold?date=${selected}`} className="mb-3 flex items-center justify-between rounded-lg border border-gold/50 px-3 py-2 text-[13px] text-gold">
                <span>Rain flagged · review the hold</span><span>›</span>
              </Link>
            )}
            <div className="flex flex-col gap-2">
              {dayJobs.map((j, idx) => (
                <div key={j.id} className="rounded-lg border border-[color:var(--border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/crm/jobs/${j.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ink)] hover:text-teal">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${j.kind === "quote" ? "bg-gold" : "bg-teal"}`} />
                        <span className="text-[color:var(--body)]/60">{idx + 1}.</span>
                        <span className="truncate">{j.customer}</span>
                        <span className="text-[color:var(--faint)]">›</span>
                        {j.weather_flag && <span title="Weather flag">🌧️</span>}
                      </Link>
                      <div className="truncate text-xs text-[color:var(--body)]">{j.address}</div>
                      <div className="mt-0.5 text-xs text-[color:var(--body)]">{j.service}{j.window_start ? ` · ${j.window_start.slice(0, 5)}` : ""}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[j.status] ?? STATUS_PILL.scheduled}`}>{j.status.replace("_", " ")}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={j.crew_id ?? ""}
                      disabled={busy === j.id}
                      onChange={(e) => updateJob(j.id, { crew_id: Number(e.target.value) })}
                      className={`h-8 flex-1 rounded-lg border border-[color:var(--border)] bg-transparent px-2 text-xs font-medium outline-none ${CREW_TEXT[j.crew_id ?? 0] ?? ""}`}
                    >
                      {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input
                      type="date"
                      defaultValue={j.scheduled_date}
                      disabled={busy === j.id}
                      onChange={(e) => e.target.value && e.target.value !== j.scheduled_date && updateJob(j.id, { scheduled_date: e.target.value })}
                      className="h-8 rounded-lg border border-[color:var(--border)] bg-transparent px-2 text-xs outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
