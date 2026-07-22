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

  const icon: Record<string, string> = { lead: "🌱", customer: "👥", job: "🗓️", thread: "💬" };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white/60 px-3 py-1.5 dark:bg-white/10">
        <span className="text-slate">🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
          placeholder="Search leads, customers, jobs, messages…"
          className="w-full bg-transparent text-sm text-navy placeholder-slate/60 outline-none dark:text-ice" />
      </div>
      {open && (hits.length > 0 || loading) && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] shadow-pop">
          {loading && <div className="px-4 py-3 text-sm text-slate">Searching…</div>}
          {hits.map((h) => (
            <button key={h.type + h.id} onClick={() => { router.push(h.href); setOpen(false); setQ(""); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ice/15">
              <span>{icon[h.type] ?? "•"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy dark:text-ice">{h.label}</span>
                <span className="block truncate text-xs text-slate">{h.sub}</span>
              </span>
              <span className="text-[10px] uppercase tracking-wide text-slate/60">{h.type}</span>
            </button>
          ))}
          {!loading && !hits.length && <div className="px-4 py-3 text-sm text-slate">No matches.</div>}
        </div>
      )}
    </div>
  );
}
