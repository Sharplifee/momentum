"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Hit = { type: string; id: string; label: string; sub: string; href: string };
type Recent = { type: string; label: string; href: string; at: number };

const KIND: Record<string, string> = { lead: "L", customer: "C", job: "J", thread: "M", exception: "X" };
const TYPE_LABEL: Record<string, string> = { lead: "Lead", customer: "Customer", job: "Job", thread: "Thread", exception: "Exception" };
const JUMP = [
  { label: "Today's route", href: "/crm/today" },
  { label: "Untouched leads", href: "/crm/leads?needs=untouched" },
  { label: "Needs a human", href: "/crm/leads?needs=human" },
  { label: "Open exceptions", href: "/crm/tracker" },
  { label: "Overdue invoices", href: "/crm/money?status=overdue" },
];
const RECENT_KEY = "mo.search.recent";

function readRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function pushRecent(r: Omit<Recent, "at">) {
  try {
    const next = [{ ...r, at: Date.now() }, ...readRecent().filter((x) => x.href !== r.href)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private window — nothing to remember with */ }
}
const recentStamp = (at: number) => {
  const d = new Date(at);
  const today = new Date().toDateString();
  return d.toDateString() === today ? "today" : d.toLocaleDateString("en-US", { weekday: "short" });
};

/** Wraps the matched run of the query in a glacier highlight. */
function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span className="rounded-[3px] bg-teal/25">{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>;
}

/**
 * The header search. Results grouped as the design shows them — kind box,
 * name with the match highlighted, one line of context, type on the right —
 * then Jump-to shortcuts and the places you opened from here recently.
 * On a phone it takes the whole screen; on a desktop it drops under the field.
 */
export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  useEffect(() => { if (open) setRecent(readRecent()); }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setMs(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const t0 = performance.now();
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`);
      if (res.ok) { const j = await res.json(); setHits(j.hits ?? []); setMs(performance.now() - t0); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(h: { type: string; label: string; href: string }) {
    pushRecent({ type: h.type, label: h.label, href: h.href });
    setOpen(false); setQ("");
    router.push(h.href);
  }
  function close() { setOpen(false); setQ(""); inputRef.current?.blur(); }

  const row = "flex w-full items-center gap-3 border-t border-[color:var(--border)] px-3.5 py-3 text-left transition first:border-t-0 hover:bg-white/[0.04]";
  const kind = "mo-mono grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md border border-white/10 text-[10px] text-[color:var(--body)]";

  return (
    <div className="relative" ref={ref}>
      <div className={`flex items-center gap-2 rounded-full border bg-[#0e0e0e] px-3.5 py-[7px] transition ${open ? "border-white/25" : "border-[color:var(--border)]"}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[color:var(--body)]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} type="search" enterKeyHint="search"
          placeholder="Search leads, customers, jobs, messages"
          className="w-full bg-transparent text-sm text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)] [&::-webkit-search-cancel-button]:hidden" />
        {q && (
          <button type="button" aria-label="Clear" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-white/[0.14] text-[11px] font-bold text-[#0a0a0a]">×</button>
        )}
      </div>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[calc(56px+env(safe-area-inset-top))] z-40 flex flex-col gap-3.5 overflow-y-auto bg-[color:var(--bg)] p-4 md:absolute md:inset-x-0 md:bottom-auto md:top-full md:mt-2 md:max-h-[72vh] md:rounded-xl md:border md:border-[color:var(--border)] md:bg-[#121212] md:p-3 md:shadow-pop">
          <button type="button" onClick={close} className="self-end text-[15px] font-medium text-[color:var(--ink)] md:hidden">Cancel</button>

          {(q.trim().length >= 2) && (
            <div className="mo-card p-0 md:border-0 md:bg-transparent md:shadow-none">
              <div className="flex items-baseline justify-between px-3.5 pb-1.5 pt-3">
                <span className="mo-eyebrow">{loading ? "Searching…" : `Results · ${hits.length}`}</span>
                {ms != null && !loading && <span className="mo-mono text-[11px] text-[color:var(--body)]">{(ms / 1000).toFixed(2)} s</span>}
              </div>
              {hits.map((h) => (
                <button key={h.type + h.id} type="button" onClick={() => go(h)} className={row}>
                  <span className={kind}>{KIND[h.type] ?? "•"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[color:var(--ink)]"><Mark text={h.label} q={q.trim()} /></span>
                    <span className="block truncate text-[12px] text-[color:var(--body)]">{TYPE_LABEL[h.type] ?? h.type}{h.sub ? ` · ${h.sub}` : ""}</span>
                  </span>
                  <span className="mo-eyebrow shrink-0 text-[9px]">{TYPE_LABEL[h.type] ?? h.type}</span>
                </button>
              ))}
              {!loading && !hits.length && <p className="border-t border-[color:var(--border)] px-3.5 py-3 text-[13px] text-[color:var(--body)]">Nothing matches “{q.trim()}”.</p>}
            </div>
          )}

          <div>
            <div className="mo-eyebrow mb-2">Jump to</div>
            <div className="flex flex-wrap gap-1.5">
              {JUMP.map((j) => (
                <Link key={j.href} href={j.href} onClick={close} className="flex h-[34px] items-center whitespace-nowrap rounded-full border border-white/10 px-3 text-[12.5px] text-[color:var(--ink)] transition hover:border-white/25">{j.label}</Link>
              ))}
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <div className="mo-eyebrow mb-2">Recent</div>
              <div className="mo-card p-0 md:border-0 md:bg-transparent md:shadow-none">
                {recent.map((r) => (
                  <button key={r.href} type="button" onClick={() => go(r)} className={row}>
                    <span className={kind}>{KIND[r.type] ?? "•"}</span>
                    <span className="flex-1 truncate text-[14px] text-[color:var(--ink)]">{r.label}</span>
                    <span className="mo-mono shrink-0 text-[11px] text-[color:var(--body)]">{recentStamp(r.at)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
