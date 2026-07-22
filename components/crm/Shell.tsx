"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GlobalSearch } from "@/components/crm/GlobalSearch";
import { AccountMenu } from "@/components/crm/AccountMenu";

type NavItem = { href: string; label: string; icon: string; roles: string[] };
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { group: "Work", items: [
    { href: "/crm/today", label: "Today", icon: "☀️", roles: ["owner", "manager", "crew"] },
    { href: "/crm/jobs", label: "Jobs & Dispatch", icon: "🗓️", roles: ["owner", "manager"] },
    { href: "/crm/routes", label: "Routes", icon: "🧭", roles: ["owner", "manager", "crew"] },
  ]},
  { group: "Grow", items: [
    { href: "/crm", label: "Dashboard", icon: "📊", roles: ["owner", "manager"] },
    { href: "/crm/leads", label: "Leads", icon: "🌱", roles: ["owner", "manager"] },
    { href: "/crm/messages", label: "Messages", icon: "💬", roles: ["owner", "manager"] },
    { href: "/crm/customers", label: "Customers", icon: "👥", roles: ["owner", "manager"] },
  ]},
  { group: "Run", items: [
    { href: "/crm/money", label: "Money", icon: "💵", roles: ["owner"] },
    { href: "/crm/marketing", label: "Marketing", icon: "📈", roles: ["owner", "manager"] },
    { href: "/crm/automations", label: "Automations", icon: "⚙️", roles: ["owner", "manager"] },
    { href: "/crm/test", label: "Flow Tester", icon: "🧪", roles: ["owner"] },
    { href: "/crm/settings", label: "Settings", icon: "🛠️", roles: ["owner"] },
  ]},
];

// mobile bottom tabs — the four crews reach for outdoors
const MOBILE_TABS: NavItem[] = [
  { href: "/crm/today", label: "Today", icon: "☀️", roles: ["owner", "manager", "crew"] },
  { href: "/crm/jobs", label: "Jobs", icon: "🗓️", roles: ["owner", "manager"] },
  { href: "/crm/messages", label: "Messages", icon: "💬", roles: ["owner", "manager"] },
];

export function Shell({ role, name, email, children }: { role: string; name: string; email?: string; children: React.ReactNode }) {
  const pathname = usePathname();
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
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal font-display text-lg font-bold text-white">M</span>
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
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate/60">{g.group}</div>
                <nav className="space-y-0.5">
                  {items.map((n) => (
                    <Link key={n.href} href={n.href}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive(n.href) ? "bg-teal text-white shadow-card" : "text-slate hover:bg-ice/15 hover:text-navy dark:hover:text-ice"}`}>
                      <span className="text-base">{n.icon}</span>{n.label}
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
                    <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate/60">{g.group}</div>
                    {items.map((n) => (
                      <Link key={n.href} href={n.href} onClick={() => setDrawer(false)}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive(n.href) ? "bg-teal text-white" : "text-slate hover:bg-ice/15"}`}>
                        <span className="text-base">{n.icon}</span>{n.label}
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
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 backdrop-blur md:hidden">
        {mobileTabs.map((n) => (
          <Link key={n.href} href={n.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive(n.href) ? "text-teal" : "text-slate"}`}>
            <span className="text-xl">{n.icon}</span>{n.label}
          </Link>
        ))}
        <button onClick={() => setDrawer(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-slate">
          <span className="text-xl">⋯</span>More
        </button>
      </nav>
    </div>
  );
}
