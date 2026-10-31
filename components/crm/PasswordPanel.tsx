"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Check } from "@/components/crm/settings/ui";
import { Switch } from "@/components/crm/settings/client";

type Breach = "idle" | "checking" | "clear" | "found" | "unknown";

/** Pwned Passwords range lookup: only the first five hex chars of the SHA-1 leave the phone. */
async function breachCheck(pw: string, signal: AbortSignal): Promise<Breach> {
  try {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw));
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { signal, headers: { "Add-Padding": "true" } });
    if (!r.ok) return "unknown";
    const text = await r.text();
    const tail = hex.slice(5);
    const hit = text.split("\n").some((line) => line.startsWith(tail) && Number(line.split(":")[1]) > 0);
    return hit ? "found" : "clear";
  } catch {
    return "unknown";
  }
}

export function PasswordPanel({ email, role, first }: { email: string; role: string; first: boolean }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNw, setShowNw] = useState(false);
  const [others, setOthers] = useState(true);
  const [breach, setBreach] = useState<Breach>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  // Rules: the first is the API's own minimum (8); the second is checked here.
  const longEnough = nw.length >= 8;
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const notObvious = nw.length > 0 && !/momentum/i.test(nw) && !(local.length >= 3 && nw.toLowerCase().includes(local));
  const matches = nw.length > 0 && nw === nw2;

  useEffect(() => {
    if (!longEnough) { setBreach("idle"); return; }
    const ctl = new AbortController();
    setBreach("checking");
    const t = setTimeout(() => { breachCheck(nw, ctl.signal).then((b) => { if (!ctl.signal.aborted) setBreach(b); }); }, 500);
    return () => { ctl.abort(); clearTimeout(t); };
  }, [nw, longEnough]);

  const ready = Boolean(cur) && longEnough && notObvious && matches && breach !== "found" && breach !== "checking";

  async function submit() {
    if (!ready || busy) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/crm/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "password", current_password: cur, new_password: nw }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error ?? "Couldn't change the password."); setBusy(false); return; }
    if (others) {
      try {
        const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        await client.auth.signOut({ scope: "others" });
      } catch { /* the password still changed; other sessions lapse on their own */ }
    }
    setDone(true);
    setTimeout(() => { window.location.href = role === "crew" ? "/crm/today" : "/crm"; }, 1200);
  }

  const field = "flex items-center gap-2.5 rounded-xl border border-[color:var(--border)] bg-[#0e0e0e] px-4 transition focus-within:border-teal";
  const input = "h-[52px] w-full bg-transparent text-[15px] tracking-[0.08em] text-[color:var(--ink)] outline-none placeholder:tracking-normal placeholder:text-[color:var(--faint)]";
  const breachRow = breach === "checking" ? { ok: false, text: "Checking known breaches…", pending: true }
    : breach === "found" ? { ok: false, text: "Found in a known breach — pick another" }
    : breach === "clear" ? { ok: true, text: "Not in a known breach" }
    : breach === "unknown" ? { ok: true, text: "Breach check unavailable right now", pending: true }
    : { ok: false, text: "Not in a known breach", pending: true };

  return (
    <div className="space-y-5">
      <nav className="mo-eyebrow flex items-center gap-1.5">
        <Link href="/crm/account" className="transition hover:text-[color:var(--ink)]">My account</Link>
        <span className="text-[color:var(--faint)]">/</span>
        <span>Password</span>
      </nav>
      <div>
        <h1 className="mo-h1 text-[28px]">{first ? "Set your password" : "Change password"}</h1>
        <p className="mt-1.5 text-[14px] leading-snug text-[color:var(--body)]">
          {first ? "You signed in with a temporary password. Choose your own to continue." : "Face ID keeps working on this device. Other devices will ask you to sign in again."}
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        <label className="block">
          <span className="mo-eyebrow mb-2 block">Current password</span>
          <div className={field}>
            <input className={input} type={showCur ? "text" : "password"} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={first ? "The temporary one you were given" : "The one you use now"} />
            <button type="button" tabIndex={-1} onClick={() => setShowCur(!showCur)} className="mo-eyebrow shrink-0 transition hover:text-[color:var(--ink)]">{showCur ? "Hide" : "Show"}</button>
          </div>
        </label>

        <label className="block">
          <span className="mo-eyebrow mb-2 block">New password</span>
          <div className={field}>
            <input className={input} type={showNw ? "text" : "password"} autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="Something only you know" />
            <button type="button" tabIndex={-1} onClick={() => setShowNw(!showNw)} className="mo-eyebrow shrink-0 transition hover:text-[color:var(--ink)]">{showNw ? "Hide" : "Show"}</button>
          </div>
        </label>

        <div className="mo-card divide-y divide-[color:var(--border)] px-4 py-1">
          {([
            { ok: longEnough, text: "8 characters or more", pending: nw.length === 0 },
            { ok: notObvious, text: 'Not your email or "momentum"', pending: nw.length === 0 },
            breachRow,
          ] as { ok: boolean; text: string; pending?: boolean }[]).map((r) => (
            <div key={r.text} className="flex items-center gap-3 py-2.5">
              {r.pending
                ? <span className="h-5 w-5 shrink-0 rounded-full border border-[color:var(--border-strong)]" />
                : <Check ok={r.ok} />}
              <span className={`text-[13px] ${r.ok ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>{r.text}</span>
            </div>
          ))}
        </div>

        <label className="block">
          <span className="mo-eyebrow mb-2 block">Confirm new password</span>
          <div className={`${field} ${nw2 && !matches ? "border-coral/60" : ""}`}>
            <input className={input} type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} placeholder="Once more" />
          </div>
          {nw2 && !matches && <span className="mt-1.5 block text-[12px] text-coral">These don&rsquo;t match yet.</span>}
        </label>

        <div className="mo-card flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-[color:var(--ink)]">Sign out other devices</div>
            <div className="text-[12px] leading-snug text-[color:var(--body)]">Every other signed-in browser or phone will ask for the new password</div>
          </div>
          <Switch on={others} label="Sign out other devices" onChange={setOthers} />
        </div>

        {err && <div className="rounded-xl border border-coral/40 px-4 py-2.5 text-[13px] text-coral">{err}</div>}
        {done && <div role="status" className="rounded-xl border border-teal/40 px-4 py-2.5 text-[13px] text-teal">Password changed. Taking you back…</div>}

        <button type="submit" disabled={!ready || busy || done} className="mo-primary h-[52px] w-full text-[15px] disabled:opacity-50">
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
