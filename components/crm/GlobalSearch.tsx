"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { type: string; id: string; label: string; sub: string; href: string };

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`);
      if (res.ok) { const j = await res.json(); setHits(j.hits ?? []); setOpen(true); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const icon: Record<string, string> = { lead: "L", customer: "C", job: "J", thread: "M" };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[#0e0e0e] px-3.5 py-[7px] transition focus-within:border-white/30">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate/70" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
          placeholder="Search leads, customers, jobs, messages…"
          className="w-full bg-transparent text-sm text-[color:var(--ink)] placeholder:text-[color:var(--faint)] outline-none" />
      </div>
      {open && (hits.length > 0 || loading) && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[#121212] shadow-pop">
          {loading && <div className="px-4 py-3 text-sm text-slate">Searching…</div>}
          {hits.map((h) => (
            <button key={h.type + h.id} onClick={() => { router.push(h.href); setOpen(false); setQ(""); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]">
              <span className="mo-mono grid h-6 w-6 shrink-0 place-items-center rounded border border-[color:var(--border)] text-[10px] text-[color:var(--body)]">{icon[h.type] ?? "•"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[color:var(--ink)]">{h.label}</span>
                <span className="block truncate text-xs text-slate">{h.sub}</span>
              </span>
              <span className="mo-eyebrow text-[color:var(--faint)]">{h.type}</span>
            </button>
          ))}
          {!loading && !hits.length && <div className="px-4 py-3 text-sm text-slate">No matches.</div>}
        </div>
      )}
    </div>
  );
}
