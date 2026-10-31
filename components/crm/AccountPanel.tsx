"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import * as bio from "@/lib/biometric";
import { INPUT } from "@/components/crm/Sheet";
import { Avatar, Group, Row, RowCard } from "@/components/crm/settings/ui";
import { Switch } from "@/components/crm/settings/client";

type Profile = { full_name: string; email: string; phone: string; notif_prefs: Record<string, boolean>; role: string };

/* Keys are the ones already stored in profiles.notif_prefs; only the words changed. */
const NOTIF_ROWS: { key: string; label: string; roles: string[] }[] = [
  { key: "new_lead", label: "New lead", roles: ["owner", "manager"] },
  { key: "escalation", label: "Norma needs a human", roles: ["owner", "manager"] },
  { key: "job_exception", label: "Exception needs you", roles: ["owner", "manager", "crew"] },
  { key: "daily_digest", label: "Daily close-out", roles: ["owner"] },
];

const ROLE_WORD: Record<string, string> = { owner: "Owner", manager: "Manager", crew: "Crew", customer: "Customer" };

export function AccountPanel({ profile, previewing, forcePassword }: { profile: Profile; previewing: boolean; forcePassword: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone);
  const [notif, setNotif] = useState<Record<string, boolean>>(profile.notif_prefs ?? {});
  const [faceId, setFaceId] = useState<boolean | null>(null);
  const [canFaceId, setCanFaceId] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setFaceId(bio.isEnrolled());
    bio.isSupported().then(setCanFaceId).catch(() => setCanFaceId(false));
  }, []);

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), bad ? 6000 : 2500);
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/crm/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, error: j.error as string | undefined };
  }

  async function saveProfile() {
    setBusy("profile");
    const r = await post({ action: "profile", full_name: name, phone, notif_prefs: notif });
    setBusy("");
    if (r.ok) { say("Saved."); setEditing(false); router.refresh(); } else say(r.error ?? "Couldn't save.", true);
  }

  async function toggleNotif(key: string, on: boolean) {
    const next = { ...notif, [key]: on };
    setNotif(next);
    setBusy(key);
    const r = await post({ action: "profile", notif_prefs: next });
    setBusy("");
    if (!r.ok) { setNotif(notif); say(r.error ?? "Couldn't save.", true); }
  }

  async function toggleFaceId(on: boolean) {
    if (!on) { bio.clearEnrollment(); setFaceId(false); say("Face ID is off on this device."); return; }
    setBusy("face");
    try {
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await client.auth.getSession();
      const token = data.session?.refresh_token;
      if (!token) { say("Sign in again to turn Face ID on.", true); return; }
      const ok = await bio.enroll(profile.email, token);
      setFaceId(ok);
      say(ok ? "Face ID is on for this device." : "Face ID wasn't set up.", !ok);
    } finally { setBusy(""); }
  }

  const roleWord = ROLE_WORD[profile.role] ?? profile.role;
  const viewWord = profile.role === "owner" || profile.role === "manager" ? (previewing ? "Crew view" : "Admin") : null;

  return (
    <div className="space-y-5">
      {/* header: back crumb, avatar + name, Edit */}
      <div className="flex items-center justify-between">
        <nav className="mo-eyebrow flex items-center gap-1.5">
          <Link href="/crm/more" className="transition hover:text-[color:var(--ink)]">More</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span>My account</span>
        </nav>
        <button type="button" onClick={() => (editing ? saveProfile() : setEditing(true))} disabled={busy === "profile"}
          className={`min-h-[36px] rounded-full px-4 text-[13px] font-semibold transition disabled:opacity-60 ${editing ? "mo-primary" : "border border-[color:var(--border-strong)] text-[color:var(--ink)] hover:border-white/30"}`}>
          {busy === "profile" ? "Saving…" : editing ? "Save" : "Edit"}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={name || profile.email} size={60} />
        <div className="min-w-0">
          {editing
            ? <input className={`${INPUT} py-2 text-[20px] font-semibold`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Display name" />
            : <h1 className="mo-h1 truncate text-[28px]">{name || profile.email}</h1>}
          <div className="mo-eyebrow mt-1.5">{roleWord}{viewWord ? ` · ${viewWord}` : ""}</div>
        </div>
      </div>

      {forcePassword && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-[13px] leading-snug text-[color:var(--ink)]">
          You&rsquo;re signed in with a temporary password. <Link href="/crm/account/password?first=1" className="font-semibold underline underline-offset-4">Set your own</Link> to continue.
        </div>
      )}
      {toast && <div role="status" className={`rounded-xl border px-4 py-2 text-[13px] ${toast.bad ? "border-coral/40 text-coral" : "border-teal/40 text-teal"}`}>{toast.text}</div>}

      <section className="mo-card aiv-glow divide-y divide-[color:var(--border)] p-0">
        <div className="px-4 py-3">
          <div className="mo-eyebrow mb-1">Email</div>
          <div className="text-[15px] text-[color:var(--ink)]">{profile.email || "—"}</div>
          {editing && <div className="mt-1 text-[11px] text-[color:var(--body)]">Ask an owner to change the email on an account.</div>}
        </div>
        <div className="px-4 py-3">
          <div className="mo-eyebrow mb-1">Mobile</div>
          {editing
            ? <input className={INPUT} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 and ten digits" aria-label="Mobile" />
            : <div className="mo-mono text-[15px] text-[color:var(--ink)]">{profile.phone || "Not set"}</div>}
        </div>
        <div className="px-4 py-3">
          <div className="mo-eyebrow mb-1">Role</div>
          <div className="text-[15px] text-[color:var(--ink)]">{roleWord}{profile.role === "owner" || profile.role === "manager" ? " · can switch to Crew view" : ""}</div>
        </div>
      </section>

      <Group label="Notifications on this phone">
        <RowCard>
          {NOTIF_ROWS.filter((r) => r.roles.includes(profile.role)).map((r) => (
            <div key={r.key} className="flex items-center gap-3 pr-4">
              <Row label={r.label} className="flex-1 pr-0" />
              <Switch on={notif[r.key] ?? true} label={r.label} disabled={busy === r.key} onChange={(v) => toggleNotif(r.key, v)} />
            </div>
          ))}
        </RowCard>
        <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-[color:var(--body)]">Saved to your account. Applies on top of the team alert list an owner controls in Settings.</p>
      </Group>

      <Group label="Security">
        <RowCard>
          <Row href="/crm/account/password" label="Change password" />
          <div className="flex items-center gap-3 pr-4">
            <Row label="Face ID to open" className="flex-1 pr-0"
              sub={!canFaceId ? "This browser can't do Face ID" : faceId ? "Locks the CRM after it has been away a while" : "Sign in with a look next time"} />
            <Switch on={Boolean(faceId)} label="Face ID to open" disabled={!canFaceId || busy === "face" || faceId === null} onChange={toggleFaceId} />
          </div>
          <Row label="Signed in" sub={`${profile.email} · this device`} />
        </RowCard>
      </Group>

      <form action="/crm/logout" method="post">
        <button type="submit" className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-coral/40 text-[15px] font-semibold text-coral transition hover:bg-coral/10">Sign out</button>
      </form>
    </div>
  );
}
