"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AccountMenu({ name, email, role }: { name: string; email?: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function toggleTheme() {
    const el = document.documentElement;
    const dark = el.classList.toggle("dark");
    try { localStorage.setItem("mo-theme", dark ? "dark" : "light"); } catch {}
    fetch("/api/crm/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "theme", theme: dark ? "dark" : "light" }) }).catch(() => {});
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/60 p-1 pr-1 hover:bg-white sm:pr-2.5 dark:bg-white/10">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal text-xs font-bold leading-none text-white">{initials}</span>
        <span className="hidden text-sm font-medium text-navy dark:text-ice sm:block">{name?.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] shadow-pop">
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <div className="font-medium text-navy dark:text-ice">{name}</div>
            <div className="text-xs text-slate">{email}</div>
            <div className="mt-1 inline-flex rounded-full bg-ice/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-navy dark:text-ice">{role}</div>
          </div>
          <Link href="/crm/account" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate hover:bg-ice/15">⚙️ My account</Link>
          <button onClick={toggleTheme} className="block w-full px-4 py-2.5 text-left text-sm text-slate hover:bg-ice/15">🌗 Toggle light / dark</button>
          <form action="/crm/logout" method="post" className="border-t border-[color:var(--border)]">
            <button className="block w-full px-4 py-2.5 text-left text-sm text-red hover:bg-red/10">↩︎ Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
