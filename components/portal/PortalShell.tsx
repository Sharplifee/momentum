"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PushBridge } from "@/components/portal/PushBridge";

const NAV = [
  { href: "/portal", label: "Home" },
  { href: "/portal/schedule", label: "Schedule" },
  { href: "/portal/history", label: "History" },
  { href: "/portal/billing", label: "Billing" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/portal/property", label: "Property" },
  { href: "/portal/preferences", label: "Preferences" },
];

export function PortalShell({ name, children }: { name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24">
      <PushBridge />
      <header className="flex items-center justify-between py-5">
        <div className="text-xl font-bold tracking-tight">Momentum <span className="text-teal">🌱</span></div>
        <span className="text-sm text-white/60">{name}</span>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-navy/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl justify-between overflow-x-auto px-2 py-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${pathname === n.href ? "bg-teal text-white" : "text-white/60"}`}>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      <footer className="mt-10 pb-4 text-center text-xs text-white/40">
        <a href="/legal/terms" className="underline">Terms</a> · <a href="/legal/privacy" className="underline">Privacy</a> · <a href="/legal/sms-terms" className="underline">SMS</a> · <a href="/legal/ai-disclosure" className="underline">AI Disclosure</a>
      </footer>
    </div>
  );
}
