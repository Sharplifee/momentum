"use client";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState , useEffect} from "react";
import { GlobalSearch } from "@/components/crm/GlobalSearch";
import { AccountMenu } from "@/components/crm/AccountMenu";
import { LocationReporter } from "@/components/crm/LocationReporter";

type NavItem = { href: string; label: string; icon: string; roles: string[] };
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { group: "", items: [
    { href: "/crm", label: "Dashboard", icon: "📊", roles: ["owner", "manager"] },
    { href: "/crm/today", label: "Today", icon: "☀️", roles: ["crew"] },
    { href: "/crm/schedule", label: "Schedule", icon: "🗓️", roles: ["owner", "manager", "crew"] },
    { href: "/crm/tracker", label: "Tracker", icon: "🧭", roles: ["owner", "manager"] },
    { href: "/crm/leads", label: "Leads", icon: "🌱", roles: ["owner", "manager"] },
    { href: "/crm/messages", label: "Wayne", icon: "💬", roles: ["owner", "manager", "crew"] },
    { href: "/crm/customers", label: "Customers", icon: "👥", roles: ["owner", "manager"] },
    { href: "/crm/accounting", label: "Accounting", icon: "💵", roles: ["owner"] },
  ]},
  { group: "More", items: [
    { href: "/crm/settings", label: "Settings", icon: "🛠️", roles: ["owner"] },
  ]},
];

// mobile bottom tabs — the four crews reach for outdoors
const MOBILE_TABS: NavItem[] = [
  { href: "/crm", label: "Home", icon: "📊", roles: ["owner", "manager"] },
  { href: "/crm/today", label: "Today", icon: "☀️", roles: ["crew"] },
  { href: "/crm/schedule", label: "Schedule", icon: "🗓️", roles: ["owner", "manager", "crew"] },
  { href: "/crm/tracker", label: "Tracker", icon: "🧭", roles: ["owner", "manager"] },
  { href: "/crm/leads", label: "Leads", icon: "🌱", roles: ["owner", "manager"] },
  { href: "/crm/messages", label: "Wayne", icon: "💬", roles: ["owner", "manager", "crew"] },
];


const ICON_PATHS: Record<string, string> = {
  "🏠": "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  "☀️": "M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  "🗓️": "M7 3v3M17 3v3M4 8h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z",
  "🧭": "M12 3a9 9 0 100 18 9 9 0 000-18zM15 9l-2 5-4 2 2-5 4-2z",
  "📊": "M5 20V10M12 20V4M19 20v-7",
  "🌱": "M12 20v-6M12 14c0-4 3-7 8-7 0 5-3 8-8 7zM12 14c0-3-2.5-5.5-6.5-5.5C5.5 12 8 14.5 12 14z",
  "💬": "M21 12a8 8 0 01-8 8H4l2.3-2.9A8 8 0 1121 12z",
  "🤖": "M12 3v3M8 6h8a3 3 0 013 3v6a3 3 0 01-3 3H8a3 3 0 01-3-3V9a3 3 0 013-3zM9 12h.01M15 12h.01M9 15.5h6",
  "👥": "M16 19v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6zM19 19v-1a3 3 0 00-2-2.8M15.5 5.3a3 3 0 010 5.4",
  "💵": "M3 7h18v10H3zM12 10a2 2 0 100 4 2 2 0 000-4zM6 10h.01M18 14h.01",
  "📈": "M4 19h16M4 15l4-4 3 3 5-6 4 4",
  "⚙️": "M12 9a3 3 0 100 6 3 3 0 000-6zM4.5 12a7.5 7.5 0 01.2-1.7l-2-1.5 2-3.4 2.3 1a7.6 7.6 0 013-1.7L10.5 2h3l.5 2.7a7.6 7.6 0 013 1.7l2.3-1 2 3.4-2 1.5a7.5 7.5 0 010 3.4l2 1.5-2 3.4-2.3-1a7.6 7.6 0 01-3 1.7l-.5 2.7h-3l-.5-2.7a7.6 7.6 0 01-3-1.7l-2.3 1-2-3.4 2-1.5A7.5 7.5 0 014.5 12z",
  "🧪": "M9 3h6M10 3v5l-5.2 9A2 2 0 006.6 20h10.8a2 2 0 001.8-3L14 8V3M8 15h8",
  "🛠️": "M14.7 6.3a4 4 0 00-5.4 5.1L3 17.6V21h3.4l6.2-6.3a4 4 0 005.1-5.4l-2.6 2.6-2.3-2.3 2.6-2.6z",
};
function NavIcon({ name }: { name: string }) {
  const d = ICON_PATHS[name];
  if (!d) return <span className="text-base">{name}</span>;
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function useBlockers() {
  const [n, setN] = useState(0);
  useEffect(() => {
    fetch("/api/crm/status").then((r) => r.json()).then((d) => setN(d.blockers ?? 0)).catch(() => {});
  }, []);
  return n;
}

export function Shell({ role, name, email, children }: { role: string; name: string; email?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const blockerCount = useBlockers();
  const [drawer, setDrawer] = useState(false);
  const can = (item: NavItem) => item.roles.includes(role);
  const isActive = (href: string) => (href === "/crm" ? pathname === "/crm" : pathname === href || pathname.startsWith(href + "/"));
  const mobileTabs = MOBILE_TABS.filter(can);

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/80 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5 md:px-6">
          <button onClick={() => setDrawer(!drawer)} className="rounded-lg p-1.5 text-slate hover:bg-ice/15 md:hidden" aria-label="Menu">☰</button>
          <Link href={role === "crew" ? "/crm/today" : "/crm"} className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="Momentum" className="h-8 w-8 shrink-0 object-contain" />
            <span className="hidden font-display text-lg font-bold text-navy dark:text-ice sm:block">Momentum</span>
          </Link>
          <div className="mx-auto w-full max-w-md"><GlobalSearch /></div>
          <AccountMenu name={name} email={email} role={role} />
        </div>
      </header>

      <div className="flex">
        {/* desktop sidebar */}
        <aside className="sticky top-[53px] hidden h-[calc(100vh-53px)] w-60 shrink-0 overflow-y-auto border-r border-[color:var(--border)] px-3 py-4 md:block">
          {NAV.map((g) => {
            const items = g.items.filter(can);
            if (!items.length) return null;
            return (
              <div key={g.group} className="mb-5">
                <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate/50">{g.group || "Menu"}</div>
                <nav className="space-y-0.5">
                  {items.map((n) => (
                    <Link key={n.href} href={n.href} prefetch
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive(n.href) ? "bg-teal/15 text-navy shadow-glow ring-1 ring-teal/40" : "text-slate hover:bg-ice/15 hover:text-navy dark:hover:text-ice"}`}>
                      <NavIcon name={n.icon} />{n.label}
                    </Link>
                  ))}
                </nav>
              </div>
            );
          })}
                  </aside>

        {/* mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
            <div className="absolute inset-0 bg-navy/40" />
            <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-[color:var(--bg)] px-3 py-4 shadow-pop" onClick={(e) => e.stopPropagation()}>
              {NAV.map((g) => {
                const items = g.items.filter(can);
                if (!items.length) return null;
                return (
                  <div key={g.group} className="mb-5">
                    <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate/50">{g.group || "Menu"}</div>
                    {items.map((n) => (
                      <Link key={n.href} href={n.href} prefetch onClick={() => setDrawer(false)}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive(n.href) ? "bg-teal text-white" : "text-slate hover:bg-ice/15"}`}>
                        <NavIcon name={n.icon} />{n.label}
                      </Link>
                    ))}
                  </div>
                );
              })}
              
        </aside>
          </div>
        )}

        {/* content */}
        <main className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>

      {/* mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-[color:var(--border)] bg-[#0b0e17]/95 pt-0.5 backdrop-blur-xl md:hidden"
        style={{
          paddingLeft: "max(14px, env(safe-area-inset-left))",
          paddingRight: "max(14px, env(safe-area-inset-right))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
        {mobileTabs.map((n) => (
          <Link key={n.href} href={n.href} prefetch
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-[10.5px] font-medium leading-none transition ${isActive(n.href) ? "text-teal" : "text-slate"}`}>
            {isActive(n.href) && <span className="absolute -top-px h-0.5 w-8 rounded-full bg-teal" />}
            <span className={`grid h-8 w-full max-w-[46px] place-items-center rounded-xl transition ${isActive(n.href) ? "bg-teal/15" : ""}`}><NavIcon name={n.icon} /></span>
            <span className="w-full truncate px-0.5 text-center">{n.label}</span>
          </Link>
        ))}
        <button onClick={() => setDrawer(true)} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-[10.5px] font-medium leading-none text-slate">
          <span className="grid h-8 w-full max-w-[46px] place-items-center rounded-xl"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg></span>
          <span className="w-full truncate px-0.5 text-center">More</span>
        </button>
      </nav>
      <LocationReporter />
    </div>
  );
}
