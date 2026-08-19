"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, PageHeader } from "@/components/ui";

type Profile = { full_name: string; email: string; phone: string; theme_pref: string; notif_prefs: Record<string, boolean>; role: string };

const NOTIF_ROWS: { key: string; label: string; roles: string[] }[] = [
  { key: "new_lead", label: "New lead comes in", roles: ["owner", "manager"] },
  { key: "job_exception", label: "A crew flags a job exception", roles: ["owner", "manager", "crew"] },
  { key: "escalation", label: "Nora escalates a conversation", roles: ["owner", "manager"] },
  { key: "daily_digest", label: "Evening digest", roles: ["owner"] },
];

function strength(pw: string): { label: string; pct: number; ok: boolean } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { label: ["Too short", "Weak", "Okay", "Good", "Strong"][s], pct: (s / 4) * 100, ok: pw.length >= 8 };
}

export function AccountPanel({ profile, forcePassword }: { profile: Profile; forcePassword: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone);
  const [notif, setNotif] = useState<Record<string, boolean>>(profile.notif_prefs ?? {});
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [nw2, setNw2] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const st = strength(nw);

  async function saveProfile() {
    setBusy("profile");
    const res = await fetch("/api/crm/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", full_name: name, phone, notif_prefs: notif }) });
    setToast(res.ok ? "Profile saved." : "Couldn't save profile."); setBusy(""); router.refresh();
  }
  async function changePassword() {
    if (nw !== nw2) { setToast("New passwords don't match."); return; }
    setBusy("pw");
    const res = await fetch("/api/crm/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "password", current_password: cur, new_password: nw }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setToast("Password changed. 🎉"); setCur(""); setNw(""); setNw2(""); setTimeout(() => router.push(profile.role === "crew" ? "/crm/today" : "/crm"), 1200); }
    else setToast(j.error ?? "Couldn't change password.");
    setBusy("");
  }
  function toggleTheme(dark: boolean) {
    const el = document.documentElement;
    el.classList.toggle("dark", dark);
    try { localStorage.setItem("mo-theme", dark ? "dark" : "light"); } catch {}
    fetch("/api/crm/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "theme", theme: dark ? "dark" : "light" }) });
  }
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My account" />
      {forcePassword && (
        <div className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-navy dark:text-ice">
          👋 Welcome! You're signed in with a temporary password — please set your own below to continue.
        </div>
      )}
      {toast && <div className="mb-4 rounded-xl bg-teal/15 px-4 py-2 text-sm text-teal">{toast}</div>}

      <Card className="mb-5">
        <h2 className="mo-h1 mb-3 text-base">Change password</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[13px] font-medium text-[color:var(--ink)]">Current password</span>
            <span className="block text-[11px] text-[color:var(--body)]">The password you just used to sign in</span>
            <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Type your current password" className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--border)] bg-white/[0.06] px-4 text-[15px] text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--body)]/40 focus:border-teal focus:bg-white/[0.09]" />
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-[color:var(--ink)]">New password</span>
            <span className="block text-[11px] text-[color:var(--body)]">At least 8 characters — make it something only you know</span>
            <input type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="Type a new password" className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--border)] bg-white/[0.06] px-4 text-[15px] text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--body)]/40 focus:border-teal focus:bg-white/[0.09]" />
          </label>
          {nw && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ice/20"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${st.pct}%` }} /></div>
              <span className="text-xs text-slate">{st.label}</span>
            </div>
          )}
          <label className="block">
            <span className="block text-[13px] font-medium text-[color:var(--ink)]">Confirm new password</span>
            <span className="block text-[11px] text-[color:var(--body)]">Type the same new password again</span>
            <input type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} placeholder="Type it once more" className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--border)] bg-white/[0.06] px-4 text-[15px] text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--body)]/40 focus:border-teal focus:bg-white/[0.09]" />
          </label>
          <Button onClick={changePassword} disabled={busy === "pw" || !cur || !st.ok}>{busy === "pw" ? "Saving…" : "Update password"}</Button>
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mo-h1 mb-3 text-base">Profile</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[13px] font-medium text-[color:var(--ink)]">Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--border)] bg-white/[0.06] px-4 text-[15px] text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--body)]/40 focus:border-teal focus:bg-white/[0.09]" /></label>
          <label className="block">
            <span className="block text-[13px] font-medium text-[color:var(--ink)]">Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[color:var(--border)] bg-white/[0.06] px-4 text-[15px] text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--body)]/40 focus:border-teal focus:bg-white/[0.09]" /></label>
          <label className="block">
            <span className="block text-[13px] font-medium text-[color:var(--ink)]">Email <span className="font-normal text-[color:var(--body)]/60">(contact an owner to change)</span></span>
            <input value={profile.email} disabled className="mt-1.5 h-12 w-full cursor-not-allowed rounded-2xl border border-[color:var(--border)] bg-white/[0.03] px-4 text-[15px] text-[color:var(--body)]" /></label>
          <Button onClick={saveProfile} disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save profile"}</Button>
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mo-h1 mb-3 text-base">Notifications</h2>
        <div className="space-y-2">
          {NOTIF_ROWS.filter((r) => r.roles.includes(profile.role)).map((r) => (
            <label key={r.key} className="flex items-center justify-between text-sm text-slate">
              {r.label}
              <input type="checkbox" checked={notif[r.key] ?? true} onChange={(e) => { const n = { ...notif, [r.key]: e.target.checked }; setNotif(n); }} className="h-4 w-4 accent-teal" />
            </label>
          ))}
          <p className="pt-1 text-xs text-slate/60">Applies on top of the team alert list an owner controls in Settings.</p>
          <Button variant="secondary" onClick={saveProfile} disabled={busy === "profile"}>Save preferences</Button>
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mo-h1 mb-3 text-base">Appearance</h2>
        <div className="flex gap-2">
          <Button variant={!isDark ? "primary" : "secondary"} onClick={() => toggleTheme(false)}>☀️ Light</Button>
          <Button variant={isDark ? "primary" : "secondary"} onClick={() => toggleTheme(true)}>🌙 Dark</Button>
        </div>
      </Card>

      <form action="/crm/logout" method="post">
        <Button variant="danger" type="submit">Sign out</Button>
      </form>
    </div>
  );
}
