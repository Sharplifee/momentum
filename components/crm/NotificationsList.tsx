"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtClock, fmtDayLabel, denverDay } from "@/lib/leadTimeline";

export type Notice = {
  id: string;
  cat: "leads" | "crew" | "money";
  title: string;
  sub: string | null;
  ts: string;
  href: string;
  tone: "teal" | "gold" | "coral" | "sage";
  /** Hollow dot + dimmed title — something that already resolved or finished. */
  done?: boolean;
};

const SEEN_KEY = "mo.notifications.seen";
const SEGS = [["all", "All"], ["leads", "Leads"], ["crew", "Crew"], ["money", "Money"]] as const;
const DOT: Record<Notice["tone"], { fill: string; ring: string }> = {
  teal: { fill: "bg-teal", ring: "border-teal" },
  gold: { fill: "bg-gold", ring: "border-gold" },
  coral: { fill: "bg-coral", ring: "border-coral" },
  sage: { fill: "bg-sage", ring: "border-sage" },
};

/**
 * Every notice, newest first, grouped by day. "New" means newer than the
 * last time you pressed Mark all read on this device — the only read state
 * the system keeps.
 */
export function NotificationsList({ items }: { items: Notice[] }) {
  const [seg, setSeg] = useState<(typeof SEGS)[number][0]>("all");
  const [seen, setSeen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY)); } catch { /* no storage */ }
    setReady(true);
  }, []);
  function markAll() {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch { /* no storage */ }
    setSeen(now);
  }

  const shown = items.filter((n) => seg === "all" || n.cat === seg);
  const isNew = (n: Notice) => ready && (seen ? n.ts > seen : Date.now() - new Date(n.ts).getTime() < 86400_000);
  const newCount = items.filter(isNew).length;

  const groups: { day: string; label: string; rows: Notice[] }[] = [];
  for (const n of shown) {
    const day = denverDay(n.ts);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(n); else groups.push({ day, label: fmtDayLabel(n.ts), rows: [n] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="-mt-1 mb-4 flex items-center justify-between gap-3">
        <nav className="mo-eyebrow flex items-center gap-1.5">
          <Link href="/crm" className="transition hover:text-[color:var(--ink)]">‹ Home</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span className="text-[color:var(--ink)]">Notifications</span>
        </nav>
        <button type="button" onClick={markAll} disabled={!newCount} className="mo-eyebrow flex min-h-[44px] items-center px-1.5 text-teal disabled:text-[color:var(--faint)]">Mark all read</button>
      </div>

      <div className="mb-3 flex items-end justify-between">
        <h1 className="font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-[color:var(--ink)]">Notifications</h1>
        <span className="mo-eyebrow">{ready ? (newCount ? `${newCount} new` : "All caught up") : ""}</span>
      </div>

      <div className="mb-4 flex gap-1 rounded-full border border-[color:var(--border)] bg-[#0e0e0e] p-[3px]">
        {SEGS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setSeg(v)}
            className={`h-[34px] flex-1 rounded-full text-[12.5px] font-semibold transition ${seg === v ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"}`}>{l}</button>
        ))}
      </div>

      {!groups.length && (
        <div className="mo-card px-5 py-12 text-center">
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Nothing here yet</p>
          <p className="mt-1 text-sm text-[color:var(--body)]">{seg === "all" ? "New leads, hand-offs, exceptions and payments land here as they happen." : "Nothing in this group in the last two weeks."}</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.day} className="mb-4">
          <div className="mo-eyebrow mb-2">{g.label}</div>
          <div className="mo-card p-0">
            {g.rows.map((n) => {
              const d = DOT[n.tone];
              const fresh = isNew(n) && !n.done;
              return (
                <Link key={n.id} href={n.href} className="flex items-center gap-3 border-t border-[color:var(--border)] px-3.5 py-[11px] transition first:border-t-0 hover:bg-white/[0.03]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${n.done ? `border ${d.ring}` : d.fill}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] ${fresh ? "font-semibold text-[color:var(--ink)]" : "font-medium text-[color:var(--body)]"}`}>{n.title}</span>
                    {n.sub && <span className="mt-0.5 block truncate text-[12px] text-[color:var(--body)]">{n.sub}</span>}
                  </span>
                  <span className="mo-mono shrink-0 text-[11px] text-[color:var(--body)]">{fmtClock(n.ts)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
