"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AccountMenu({ name, email, role, previewing }: {
  name: string; email?: string; role: string; previewing?: boolean;
}) {
  // The crew view is a UI preview, not a lower account tier — so this shows the
  // real role and says plainly when a preview is on.
  const setView = async (view: "crew" | null) => {
    await fetch("/api/crm/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view }),
    });
    window.location.href = view === "crew" ? "/crm/today" : "/crm";
  };
  const canPreview = role === "owner" || role === "manager";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border border-[color:var(--border)] p-[3px] pr-[3px] transition hover:border-white/25 sm:pr-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--ink)] text-[11px] font-semibold leading-none text-[#0a0a0a]">{initials}</span>
        <span className="hidden text-[13px] font-medium text-[color:var(--ink)] sm:block">{name?.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-pop" style={{ background: "#121212" }}>
          <div className="mo-hairline" />
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <div className="text-[14px] font-medium text-[color:var(--ink)]">{name}</div>
            <div className="truncate text-xs text-[color:var(--body)]">{email}</div>
            <div className="mo-eyebrow mt-1.5">{role}</div>
          </div>
          <Link href="/crm/account" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-[color:var(--body)] transition hover:bg-white/[0.04] hover:text-[color:var(--ink)]">My account</Link>
          {canPreview && (
            <button
              onClick={() => setView(previewing ? null : "crew")}
              className="block w-full px-4 py-2.5 text-left text-sm text-[color:var(--body)] transition hover:bg-white/[0.04] hover:text-[color:var(--ink)]"
            >
              {previewing ? "Back to admin view" : "View as crew"}
            </button>
          )}
          <form action="/crm/logout" method="post" className="border-t border-[color:var(--border)]">
            <button className="block w-full px-4 py-2.5 text-left text-sm text-red transition hover:bg-red/10">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
