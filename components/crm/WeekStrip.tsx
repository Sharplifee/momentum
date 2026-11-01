"use client";

import { useState } from "react";
import Link from "next/link";

export type WeekStop = { id: string; time: string | null; name: string; service: string; city: string | null; quote: boolean };
export type WeekDay = {
  iso: string;          // YYYY-MM-DD (Denver)
  label: string;        // Tue
  num: number;          // 27
  svc: number;          // service visits
  quote: number;        // quote visits
  rain: boolean;        // weather cron flagged the day
  off: boolean;         // Sunday
  stops: WeekStop[];    // ordered by window
};

const fmt = (t: string | null) => t ? `${Number(t.slice(0, 2)) % 12 || 12}${t.slice(3, 5) !== "00" ? ":" + t.slice(3, 5) : ""}` : "—";

/**
 * The dashboard's seven-day view: one column per day with service (teal) and
 * quote (gold) segments, today filled, a rain ring on flagged days; tap a day
 * and the stop list under it follows. Replaces the old activity feed — the
 * owner's first question in the morning is "what's on this week", not "what
 * happened".
 */
export function WeekStrip({ days, todayIso }: { days: WeekDay[]; todayIso: string }) {
  const [sel, setSel] = useState(todayIso);
  const day = days.find((d) => d.iso === sel) ?? days[0];
  const total = days.reduce((n, d) => n + d.svc + d.quote, 0);
  const first = days[0]; const last = days[days.length - 1];
  const span = first && last ? `${mdy(first.iso)} → ${mdy(last.iso)}` : "";
  const shown = day?.stops.slice(0, 3) ?? [];
  const more = (day?.stops.length ?? 0) - shown.length;
  const dayLabel = day ? new Date(day.iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" }) : "";
  const range = day?.stops.length
    ? `${fmt(day.stops[0].time)}${day.stops[day.stops.length - 1].time ? ` – ${fmt(day.stops[day.stops.length - 1].time)}` : ""}`
    : null;

  return (
    <div className="mo-card aiv-glow px-3 pb-2 pt-4">
      <div className="mx-1 mb-2.5 flex items-baseline justify-between">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">This week</h2>
        <Link href={`/crm/schedule?m=${todayIso.slice(0, 7)}&d=${todayIso}`} className="mo-eyebrow text-teal">{span} · Schedule</Link>
      </div>

      <div className="flex gap-0.5" role="group" aria-label="Seven-day view">
        {days.map((d) => {
          const on = d.iso === sel; const today = d.iso === todayIso;
          const segs = [...Array(Math.min(d.svc, 8)).fill("svc"), ...Array(Math.min(d.quote, 4)).fill("q")];
          return (
            <button key={d.iso} type="button" onClick={() => setSel(d.iso)} aria-pressed={on}
              aria-label={`${d.label} ${d.num}: ${d.svc} service visit${d.svc === 1 ? "" : "s"}${d.quote ? `, ${d.quote} quote visit${d.quote === 1 ? "" : "s"}` : ""}${d.rain ? ", rain flag" : ""}${d.off ? ", off" : ""}`}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-[10px] py-2 pb-2.5 ${on ? "bg-white/[0.04]" : ""}`}>
              <span className={`mo-eyebrow text-[8.5px] ${d.off ? "text-[color:var(--faint)]" : today ? "text-[color:var(--ink)]" : ""}`}>{d.label}</span>
              <span className={`grid h-[30px] w-[30px] place-items-center rounded-full text-[14px] ${today ? "bg-[color:var(--ink)] font-semibold text-[#0a0a0a]" : d.off ? "text-[color:var(--faint)]" : "text-[color:var(--ink)]"}`}
                style={d.rain ? { boxShadow: "inset 0 0 0 1px rgba(227,163,95,.7)" } : undefined}>{d.num}</span>
              <span className="flex h-[30px] w-[18px] flex-col-reverse gap-[2px]" aria-hidden="true">
                {segs.length ? segs.map((s, i) => <span key={i} className={`h-[5px] w-full rounded-[2px] ${s === "q" ? "bg-gold" : "bg-teal"}`} />) : <span className="h-[5px] w-full rounded-[2px] bg-white/[0.07]" />}
              </span>
              <span className={`mo-mono text-[10px] ${d.off && !d.svc && !d.quote ? "text-[color:var(--faint)]" : "text-[color:var(--ink)]"}`}>
                {d.off && !d.svc && !d.quote ? "off" : d.svc || !d.quote ? d.svc : ""}{d.quote ? <span className="text-gold">{d.svc ? " " : ""}+{d.quote}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mx-1 mt-2 flex items-center gap-3">
        <span className="flex items-center gap-1.5"><span className="h-[5px] w-[10px] rounded-[2px] bg-teal" /><span className="mo-eyebrow text-[8.5px]">Service</span></span>
        <span className="flex items-center gap-1.5"><span className="h-[5px] w-[10px] rounded-[2px] bg-gold" /><span className="mo-eyebrow text-[8.5px]">Quote</span></span>
        <span className="flex items-center gap-1.5"><span className="h-[10px] w-[10px] rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(227,163,95,.7)" }} /><span className="mo-eyebrow text-[8.5px]">Rain flag</span></span>
        <span className="flex-1" />
        <span className="mo-mono text-[10px] text-[color:var(--body)]">{total} stop{total === 1 ? "" : "s"}</span>
      </div>

      {day && (
        <div className="mx-1 mt-2">
          <div className="flex items-baseline justify-between py-1.5">
            <span className="mo-eyebrow text-[color:var(--ink)]">{day.iso === todayIso ? "Today · " : ""}{dayLabel}</span>
            <span className="mo-mono text-[11px] text-[color:var(--body)]">{day.stops.length ? `${day.stops.length} stop${day.stops.length === 1 ? "" : "s"}${range ? ` · ${range}` : ""}` : day.off ? "Day off" : "Nothing scheduled"}</span>
          </div>
          {shown.map((s) => (
            <Link key={s.id} href={`/crm/jobs/${s.id}`} className="flex items-center gap-2.5 border-t border-[color:var(--border)] py-2.5">
              <span className="mo-mono w-[46px] shrink-0 text-[11px] text-[color:var(--body)]">{fmt(s.time)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--ink)]">{s.name} · {s.service.toLowerCase()}{s.quote ? <span className="text-gold"> · quote</span> : null}</span>
              <span className="mo-mono shrink-0 text-[11px] text-[color:var(--body)]">{s.city ?? ""}</span>
            </Link>
          ))}
          {(more > 0 || (!shown.length && !day.off)) && (
            <Link href={`/crm/schedule?m=${day.iso.slice(0, 7)}&d=${day.iso}`} className="mo-eyebrow flex items-center justify-center border-t border-[color:var(--border)] py-2.5 text-teal">
              {more > 0 ? `${more} more · open ${day.iso === todayIso ? "today" : dayLabel}` : "Open the day"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function mdy(iso: string) { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
