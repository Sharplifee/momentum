"use client";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState , useEffect} from "react";
import { GlobalSearch } from "@/components/crm/GlobalSearch";
import { AccountMenu } from "@/components/crm/AccountMenu";
import { LocationReporter } from "@/components/crm/LocationReporter";
import { OfflineBanner } from "./OfflineBanner";
import { LiveRefresh } from "@/components/crm/LiveRefresh";
import {
  House,
  Sprout,
  MessagesSquare,
  CalendarDays,
  Users,
  Wallet,
  Settings as SettingsIcon,
  Sun,
  Map as MapIcon,
  CalendarRange,
  Ellipsis,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: "home"|"leads"|"inbox"|"schedule"|"customers"|"money"|"settings"|"today"|"map"|"week"|"more"; roles: string[] };
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { group: "", items: [
    { href: "/crm", label: "Home", icon: "home", roles: ["owner", "manager"] },
    { href: "/crm/leads", label: "Leads", icon: "leads", roles: ["owner", "manager"] },
    { href: "/crm/inbox", label: "Inbox", icon: "inbox", roles: ["owner", "manager"] },
    { href: "/crm/schedule", label: "Schedule", icon: "schedule", roles: ["owner", "manager"] },
    { href: "/crm/customers", label: "Customers", icon: "customers", roles: ["owner", "manager"] },
    { href: "/crm/accounting", label: "Money", icon: "money", roles: ["owner"] },
  ]},
  { group: "More", items: [
    { href: "/crm/settings", label: "Settings", icon: "settings", roles: ["owner"] },
  ]},
];

// mobile bottom tabs — the four crews reach for outdoors
const MOBILE_TABS: NavItem[] = [
  // owner/manager
  { href: "/crm", label: "Home", icon: "home", roles: ["owner", "manager"] },
  { href: "/crm/leads", label: "Leads", icon: "leads", roles: ["owner", "manager"] },
  { href: "/crm/schedule", label: "Schedule", icon: "schedule", roles: ["owner", "manager"] },
  { href: "/crm/inbox", label: "Inbox", icon: "inbox", roles: ["owner", "manager"] },
  // crew
  { href: "/crm/today", label: "Today", icon: "today", roles: ["crew"] },
  { href: "/crm/today?view=map", label: "Map", icon: "map", roles: ["crew"] },
  { href: "/crm/schedule", label: "Week", icon: "week", roles: ["crew"] },
];


function NavIcon({ name }: { name: NavItem["icon"] }) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (name) {
    case "home": return <House className={cls} strokeWidth={1.75} />;
    case "leads": return <Sprout className={cls} strokeWidth={1.75} />;
    case "inbox": return <MessagesSquare className={cls} strokeWidth={1.75} />;
    case "schedule": return <CalendarDays className={cls} strokeWidth={1.75} />;
    case "customers": return <Users className={cls} strokeWidth={1.75} />;
    case "money": return <Wallet className={cls} strokeWidth={1.75} />;
    case "settings": return <SettingsIcon className={cls} strokeWidth={1.75} />;
    case "today": return <Sun className={cls} strokeWidth={1.75} />;
    case "map": return <MapIcon className={cls} strokeWidth={1.75} />;
    case "week": return <CalendarRange className={cls} strokeWidth={1.75} />;
    case "more": return <Ellipsis className={cls} strokeWidth={1.75} />;
    default: return null;
  }
}

/* Settings badge count for the desktop sidebar. Owners only, and remembered
   for ten minutes per tab so a page change doesn't cost a round trip. */
function useBlockers(enabled: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const KEY = "mo_blockers";
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { n: number; at: number } | null;
      if (c && Date.now() - c.at < 10 * 60_000) { setN(c.n); return; }
    } catch { /* storage unavailable */ }
    fetch("/api/crm/status").then((r) => r.json()).then((d) => {
      const v = d.blockers ?? 0; setN(v);
      try { sessionStorage.setItem(KEY, JSON.stringify({ n: v, at: Date.now() })); } catch { /* ignore */ }
    }).catch(() => {});
  }, [enabled]);
  return n;
}

/**
 * `role` is the EFFECTIVE role — crew while previewing — so the nav and page
 * guards behave exactly as they would on a crew phone. `realRole` is who the
 * person actually is, and is what the banner and the account menu show.
 */


/**
 * Preview banner (crew view)
 */
function PreviewBanner() {
  const [busy, setBusy] = useState(false);
  const exit = async () => {
    if (busy) return;
    setBusy(true);
    await fetch("/api/crm/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: null }) }).catch(() => null);
    window.location.href = "/crm";
  };
  return (
    <div className="sticky top-[56px] z-header border-b border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-2 text-[13px] text-[color:var(--body)] md:px-6" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div><span className="mo-eyebrow text-[color:var(--faint)]">Preview</span> Previewing crew view</div>
        <button onClick={exit} disabled={busy} className="rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]">Exit</button>
      </div>
    </div>
  );
}

export function Shell({ role, name, email, realRole, previewing, children }: {
  role: string; name: string; email?: string;
  realRole?: string; previewing?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const blockerCount = useBlockers(realRole === "owner");
  const [drawer, setDrawer] = useState(false);
  const can = (item: NavItem) => item.roles.includes(role);
  const isActive = (href: string) => (href === "/crm" ? pathname === "/crm" : pathname === href || pathname.startsWith(href + "/"));
  const moreActive = ["/crm/more", "/crm/settings", "/crm/account", "/crm/customers", "/crm/accounting", "/crm/expenses", "/crm/notifications"].some((h) => isActive(h));
  const mobileTabs = MOBILE_TABS.filter(can);

  const topOffset = 0;

  return (
    <div className="min-h-screen">
      {/* top bar — shifts below the preview banner when it is showing */}
      <header
        className="sticky z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]"
        style={{ top: topOffset, paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-[56px] items-center gap-3 px-4 md:px-6">
          <button onClick={() => setDrawer(!drawer)} className="rounded-full p-1.5 text-[color:var(--body)] hover:text-[color:var(--ink)] md:hidden" aria-label="Menu">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
          <Link href={role === "crew" ? "/crm/today" : "/crm"} className="flex items-center gap-2.5 md:w-[208px]">
            <img src="/logo-mark.png" alt="Momentum" className="h-7 w-7 shrink-0 object-contain" />
            <span className="hidden font-display text-[19px] font-semibold tracking-[-0.04em] text-[color:var(--ink)] sm:block">Momentum<span className="ml-0.5 align-super text-[8px] font-medium tracking-normal text-[color:var(--body)]">©</span></span>
          </Link>
          <div className="mx-auto w-full max-w-md"><GlobalSearch /></div>
          <AccountMenu name={name} email={email} role={realRole ?? role} previewing={previewing} />
        </div>
      </header>
      {previewing && <PreviewBanner />}
      <OfflineBanner />

      <div className="flex">
        {/* desktop sidebar */}
        <aside className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-[232px] shrink-0 flex-col border-r border-[color:var(--border)] md:flex">
          <div className="flex-1 overflow-y-auto px-3 py-5">
            {NAV.map((g) => {
              const items = g.items.filter(can);
              if (!items.length) return null;
              return (
                <div key={g.group} className="mb-6">
                  <div className="mo-eyebrow px-3 pb-2 text-[color:var(--faint)]">{g.group || "Workspace"}</div>
                  <nav className="space-y-px">
                    {items.map((n) => {
                      const active = isActive(n.href);
                      return (
                        <Link key={n.href} href={n.href} prefetch
                          className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition ${active ? "text-[color:var(--ink)]" : "text-[color:var(--body)] hover:text-[color:var(--ink)]"}`}>
                          <span aria-hidden className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition ${active ? "bg-ribbon opacity-100" : "opacity-0"}`} />
                          <span className={`transition ${active ? "text-[color:var(--ink)]" : "text-[color:var(--faint)] group-hover:text-[color:var(--body)]"}`}><NavIcon name={n.icon} /></span>
                          {n.label}
                          {n.href === "/crm/settings" && blockerCount > 0 && (
                            <span className="ml-auto rounded-full border border-gold/50 px-1.5 text-[10px] font-semibold leading-4 text-gold">{blockerCount}</span>
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              );
            })}
          </div>
          <div className="px-6 pb-5 pt-3">
            <div className="mo-hairline-soft mb-3" />
            <div className="mo-eyebrow leading-[1.7] text-[color:var(--faint)]">Momentum Landscaping<br />South Salt Lake Valley · MT</div>
          </div>
        </aside>

        {/* mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
            <div className="absolute inset-0 bg-black/70" />
            <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-4" onClick={(e) => e.stopPropagation()}>
              {/* The header is cramped on a phone, so the switch lives here too —
                  the drawer is where a phone user looks for anything not a tab. */}
              {(realRole === "owner" || realRole === "manager") && (
                <div className="mb-5 px-1">
                  <div className="mo-eyebrow px-2 pb-2 text-[color:var(--faint)]">View</div>
                  {/* The view switch now lives in Account menu and /crm/more; keep a quick link here */}
                  <Link href={previewing ? "/crm" : "/crm/today"} className="mo-segment-item block rounded-full px-3 py-2 text-center text-[13px] font-semibold text-[color:var(--ink)]">
                    {previewing ? "Back to admin" : "View as crew"}
                  </Link>
                </div>
              )}
              {NAV.map((g) => {
                const items = g.items.filter(can);
                if (!items.length) return null;
                return (
                  <div key={g.group} className="mb-5">
                    <div className="mo-eyebrow px-3 pb-2 text-[color:var(--faint)]">{g.group || "Workspace"}</div>
                    {items.map((n) => (
                      <Link key={n.href} href={n.href} prefetch onClick={() => setDrawer(false)}
                        className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive(n.href) ? "bg-white/[0.06] text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>
                        <NavIcon name={n.icon} />{n.label}
                      </Link>
                    ))}
                  </div>
                );
              })}
              <div className="mt-4 px-3">
                <div className="mo-hairline-soft mb-3" />
                <div className="mo-eyebrow leading-[1.7] text-[color:var(--faint)]">Momentum Landscaping<br />South Salt Lake Valley · MT</div>
              </div>
            </aside>
          </div>
        )}

        {/* content */}
        <main className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-10 lg:px-10">{children}</main>
      </div>

      {/* mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 pt-0.5 backdrop-blur-xl md:hidden"
        style={{
          paddingLeft: "max(14px, env(safe-area-inset-left))",
          paddingRight: "max(14px, env(safe-area-inset-right))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
        {mobileTabs.map((n) => (
          <Link key={n.href} href={n.href} prefetch
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium leading-none transition ${isActive(n.href) ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>
            {isActive(n.href) && <span className="absolute -top-px h-[2px] w-8 rounded-full bg-ribbon" />}
            <span className="grid h-8 w-full max-w-[46px] place-items-center"><NavIcon name={n.icon} /></span>
            <span className="w-full truncate px-0.5 text-center">{n.label}</span>
          </Link>
        ))}
        <Link href="/crm/more" prefetch className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium leading-none transition ${moreActive ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>
          {moreActive && <span className="absolute -top-px h-[2px] w-8 rounded-full bg-ribbon" />}
          <span className="grid h-8 w-full max-w-[46px] place-items-center"><Ellipsis className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
          <span className="w-full truncate px-0.5 text-center">More</span>
        </Link>
      </nav>
      <LocationReporter />
      <LiveRefresh />
    </div>
  );
}
