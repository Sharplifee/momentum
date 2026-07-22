"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV: { href: string; label: string; roles: string[] }[] = [
  { href: "/crm", label: "Dashboard", roles: ["owner", "manager"] },
  { href: "/crm/leads", label: "Leads", roles: ["owner", "manager"] },
  { href: "/crm/customers", label: "Customers", roles: ["owner", "manager"] },
  { href: "/crm/jobs", label: "Jobs", roles: ["owner", "manager"] },
  { href: "/crm/tracker", label: "Tracker", roles: ["owner", "manager"] },
  { href: "/crm/today", label: "Today", roles: ["owner", "manager", "crew"] },
  { href: "/crm/routes", label: "Routes", roles: ["owner", "manager", "crew"] },
  { href: "/crm/messages", label: "Messages", roles: ["owner", "manager"] },
  { href: "/crm/money", label: "Money", roles: ["owner"] },
  { href: "/crm/expenses", label: "Expenses", roles: ["owner"] },
  { href: "/crm/marketing", label: "Marketing", roles: ["owner", "manager"] },
  { href: "/crm/automations", label: "Automations", roles: ["owner", "manager"] },
  { href: "/crm/test", label: "Flow Tester", roles: ["owner"] },
  { href: "/crm/settings", label: "Settings", roles: ["owner"] },
];

export function Shell({ role, name, children }: { role: string; name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <div className="flex min-h-screen">
      {/* mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden dark:border-stone-800 dark:bg-stone-900">
        <button onClick={() => setOpen(!open)} className="font-bold text-moss">☰ Momentum</button>
        <span className="text-sm text-stone-500">{name}</span>
      </div>
      {/* sidebar */}
      <aside className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-30 w-56 border-r border-stone-200 bg-white p-4 pt-14 md:block md:pt-4 dark:border-stone-800 dark:bg-stone-900`}>
        <div className="mb-6 hidden text-xl font-bold text-moss md:block">Momentum</div>
        <nav className="space-y-1">
          {items.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${pathname === n.href ? "bg-moss text-white" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <form action="/crm/logout" method="post" className="mt-8">
          <button className="text-sm text-stone-400 underline">Sign out</button>
        </form>
      </aside>
      <main className="flex-1 p-4 pt-16 md:ml-56 md:p-8 md:pt-8">{children}</main>
    </div>
  );
}
