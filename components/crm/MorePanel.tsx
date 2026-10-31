"use client";

import { useEffect, useState } from "react";
import * as bio from "@/lib/biometric";
import { Avatar, Footnote, Group, Row, RowCard, Tag, type Tone } from "@/components/crm/settings/ui";

const ICON = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const I = {
  customers: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 19v-1a3 3 0 0 0-2-2.8M15.5 5.3a3 3 0 0 1 0 5.4",
  accounting: "M3 7h18v10H3zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 10h.01M18 14h.01",
  expenses: "M4 5h16v14H4zM4 10h16M9 15h3",
  settings: "M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.6V21h3.4l6.2-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.3-2.3 2.6-2.6z",
  location: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10zM12 13.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  face: "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10v1M15 10v1M12 10v3h-1M9 15.5s1 1 3 1 3-1 3-1",
  sync: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  out: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9",
};

type Perm = "granted" | "denied" | "prompt" | "unsupported" | null;
const OFFLINE_QUEUE_KEY = "momentum_offline_queue"; // same key TodayStops replays

/** Admin ⇄ Crew. Same call Shell makes; full reload because the role is resolved server-side. */
function ViewSwitch({ previewing }: { previewing: boolean }) {
  const [busy, setBusy] = useState(false);
  const go = async (view: "crew" | null) => {
    if (busy) return;
    setBusy(true);
    await fetch("/api/crm/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view }) }).catch(() => null);
    window.location.href = view === "crew" ? "/crm/today" : "/crm";
  };
  const seg = "flex h-[34px] flex-1 items-center justify-center rounded-full text-[13px] font-semibold transition disabled:opacity-60";
  return (
    <div className="mo-segment flex gap-1 p-[3px]" role="group" aria-label="Switch between admin and crew">
      <button disabled={busy} onClick={() => go(null)} className={`${seg} ${previewing ? "text-[color:var(--body)]" : "bg-[color:var(--ink)] text-[#0a0a0a]"}`}>Admin</button>
      <button disabled={busy} onClick={() => go("crew")} className={`${seg} ${previewing ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"}`}>Crew</button>
    </div>
  );
}

export function MorePanel({ name, email, role, realRole, previewing, counts }: {
  name: string; email: string; role: string; realRole?: string; previewing: boolean;
  counts: { customers: number | null; overdue: number | null; blockers: number };
}) {
  const canSwitch = realRole === "owner" || realRole === "manager";
  const admin = role === "owner" || role === "manager";
  const owner = role === "owner";

  const [loc, setLoc] = useState<Perm>(null);
  const [notif, setNotif] = useState<Perm>(null);
  const [faceId, setFaceId] = useState<boolean | null>(null);
  const [queued, setQueued] = useState<number | null>(null);

  useEffect(() => {
    // Location: ask the permissions API; it says what the browser will do, not what we hope.
    if (!("geolocation" in navigator)) setLoc("unsupported");
    else if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then((s) => {
        setLoc(s.state as Perm);
        s.onchange = () => setLoc(s.state as Perm);
      }).catch(() => setLoc("prompt"));
    } else setLoc("prompt");
    // Notification.permission says "default" where the Permissions API says "prompt".
    setNotif("Notification" in window ? ((Notification.permission === "default" ? "prompt" : Notification.permission) as Perm) : "unsupported");
    setFaceId(bio.isEnrolled());
    const readQueue = () => { try { setQueued((JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]") as unknown[]).length); } catch { setQueued(0); } };
    readQueue();
    window.addEventListener("storage", readQueue);
    window.addEventListener("online", readQueue);
    return () => { window.removeEventListener("storage", readQueue); window.removeEventListener("online", readQueue); };
  }, []);

  const permTag = (p: Perm, onWord: string): { tone: Tone; text: string } => {
    if (p === "granted") return { tone: "sage", text: onWord };
    if (p === "denied") return { tone: "coral", text: "Blocked" };
    if (p === "unsupported") return { tone: "faint", text: "Not here" };
    if (p === "prompt") return { tone: "gold", text: "Not set" };
    return { tone: "faint", text: "…" };
  };
  const locTag = permTag(loc, "Allowed");
  const notifTag = permTag(notif, "On");
  const roleWord = realRole === "owner" ? "Owner" : realRole === "manager" ? "Manager" : "Crew";

  return (
    <div className="space-y-5 pt-1">
      <RowCard>
        <Row href="/crm/account" lead={<Avatar name={name} size={48} />} className="py-3.5"
          label={<span className="text-[16px] font-semibold">{name || email}</span>}
          sub={<span className="mo-eyebrow">{roleWord} · Momentum Landscaping{previewing ? " · crew view" : ""}</span>} />
      </RowCard>

      {canSwitch && (
        <Group label="View">
          <ViewSwitch previewing={previewing} />
          <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-[color:var(--body)]">Crew shows exactly what the crew sees on their phones — Today, Schedule, Norma. Nothing else changes.</p>
        </Group>
      )}

      {admin && (
        <Group label="Workspace">
          <RowCard>
            <Row href="/crm/customers" lead={ICON(I.customers)} label="Customers"
              trail={counts.customers != null ? <span className="mo-mono text-[12px] text-[color:var(--body)]">{counts.customers}</span> : undefined} />
            {owner && (
              <Row href="/crm/accounting" lead={ICON(I.accounting)} label="Accounting"
                trail={counts.overdue ? <Tag tone="coral">{counts.overdue} overdue</Tag> : undefined} />
            )}
            {owner && <Row href="/crm/expenses" lead={ICON(I.expenses)} label="Expenses" />}
            {owner && (
              <Row href="/crm/settings" lead={ICON(I.settings)} label="Settings"
                trail={counts.blockers ? <Tag tone="gold">{counts.blockers} blocker{counts.blockers === 1 ? "" : "s"}</Tag> : undefined} />
            )}
          </RowCard>
        </Group>
      )}

      <Group label="Device">
        <RowCard>
          <Row lead={ICON(I.location)} label="Location" trail={<Tag tone={locTag.tone}>{locTag.text}</Tag>} />
          <Row href="/crm/notifications" lead={ICON(I.bell)} label="Notifications" trail={<Tag tone={notifTag.tone}>{notifTag.text}</Tag>} />
          <Row href="/crm/account" lead={ICON(I.face)} label="Face ID lock"
            trail={faceId === null ? <Tag>…</Tag> : faceId ? <Tag tone="sage">Enrolled</Tag> : <Tag tone="faint">Off</Tag>} />
          <Row lead={ICON(I.sync)} label="Offline queue"
            trail={<span className="mo-mono text-[12px] text-[color:var(--body)]">{queued == null ? "…" : `${queued} waiting`}</span>} />
        </RowCard>
      </Group>

      <form action="/crm/logout" method="post">
        <button type="submit" className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-coral/40 text-[15px] font-semibold text-coral transition hover:bg-coral/10">
          <span className="text-coral">{ICON(I.out)}</span>Sign out
        </button>
      </form>

      <Footnote>© {new Date().getFullYear()} Momentum Landscaping LLC</Footnote>
    </div>
  );
}
