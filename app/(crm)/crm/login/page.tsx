"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import * as bio from "@/lib/biometric";

type Mode = "checking" | "biometric" | "password";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Face ID is the default door once a device has been enrolled. We start in
  // "checking" so the password form never flashes on screen first.
  const [mode, setMode] = useState<Mode>("checking");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [canEnroll, setCanEnroll] = useState(false);
  const [offerEnroll, setOfferEnroll] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const client = useCallback(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const runUnlock = useCallback(async () => {
    setBusy(true);
    setError("");
    const res = await bio.unlock();

    if (!res.ok) {
      setBusy(false);
      if (res.reason === "cancelled") return; // stay on the Face ID screen
      bio.clearEnrollment();
      setSavedEmail(null);
      setMode("password");
      setError("That saved sign-in expired — enter your password once more.");
      return;
    }

    const { data, error } = await client().auth.refreshSession({
      refresh_token: res.refreshToken,
    });

    if (error || !data.session) {
      // The refresh token was revoked or aged out server-side.
      bio.clearEnrollment();
      setSavedEmail(null);
      setBusy(false);
      setMode("password");
      setError("That saved sign-in expired — enter your password once more.");
      return;
    }
    window.location.href = "/crm";
  }, [client]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supported = await bio.isSupported();
      if (!alive) return;
      setCanEnroll(supported);
      const who = bio.enrolledEmail();
      if (supported && who) {
        setSavedEmail(who);
        setMode("biometric");
        void runUnlock(); // prompt immediately — one tap, no typing
      } else {
        setMode("password");
      }
    })();
    return () => {
      alive = false;
    };
  }, [runUnlock]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    // Walkthrough shortcut: submitting both fields empty signs in as Connor, so
    // the CRM can be reviewed on a phone without typing a password.
    // TEMPORARY — remove before this URL reaches anyone outside the three of you.
    const blank = !email.trim() && !password;
    const { data, error } = await client().auth.signInWithPassword({
      email: blank ? "cwsharp23@gmail.com" : email,
      password: blank ? "MomentumBoss2026!" : password,
    });

    if (error || !data.session) {
      setError("That email and password don't match — try again.");
      setBusy(false);
      return;
    }

    // Offer Face ID once, on the device where the password was just typed —
    // but never on the blank walkthrough path. Sign-in succeeded there and then
    // stopped on an enrolment prompt, which reads as the button doing nothing.
    // There is also no password worth enrolling: the point of blank is speed.
    if (!blank && canEnroll && !bio.isEnrolled()) {
      setPendingToken(data.session.refresh_token);
      setOfferEnroll(true);
      setBusy(false);
      return;
    }
    window.location.href = "/crm";
  }

  async function acceptEnroll() {
    setBusy(true);
    if (pendingToken) await bio.enroll(email, pendingToken);
    window.location.href = "/crm";
  }

  function declineEnroll() {
    window.location.href = "/crm";
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5">
      {/* ambient glows */}
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-teal/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 h-[360px] w-[480px] rounded-full bg-teal/10 blur-[110px]" />

      <div className="relative w-full max-w-[400px]">
        {/* brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.png" alt="Momentum Landscaping" className="mb-5 h-20 w-auto" />
          <h1 className="font-display text-[26px] font-bold tracking-tight text-[color:var(--ink)]">Momentum Landscaping</h1>
          <p className="mt-1 text-sm text-[color:var(--body)]">Operations · sign in to your workspace</p>
        </div>

        {mode === "checking" && (
          <div className="mo-card aiv-glow flex items-center justify-center gap-2.5 p-8 text-[14px] text-[color:var(--body)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-teal" />
            Checking this device…
          </div>
        )}

        {/* ---------- Face ID door ---------- */}
        {mode === "biometric" && (
          <div className="mo-card aiv-glow space-y-5 p-6 text-center sm:p-7">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-teal/40 bg-teal/10">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-teal" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <path d="M9 10v1M15 10v1M12 10v3h-1M9 15.5s1 1 3 1 3-1 3-1" />
              </svg>
            </div>

            <div>
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">Unlock with Face ID</p>
              <p className="mt-1 text-[13px] text-[color:var(--body)]">
                Signed in as {savedEmail}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red/30 bg-red/10 px-3.5 py-2.5 text-left text-[13px] text-red">
                <span className="mt-0.5">⚠</span>{error}
              </div>
            )}

            <button
              onClick={runUnlock}
              disabled={busy}
              className="mo-primary h-12 w-full rounded-2xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Unlocking…</span>
              ) : "Unlock"}
            </button>

            <button
              onClick={() => { setMode("password"); setError(""); }}
              className="text-[12px] font-medium text-[color:var(--body)]/70 transition hover:text-teal"
            >
              Use password instead
            </button>
          </div>
        )}

        {/* ---------- offer to turn Face ID on ---------- */}
        {offerEnroll && (
          <div className="mo-card aiv-glow space-y-5 p-6 text-center sm:p-7">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-teal/40 bg-teal/10">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-teal" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <path d="M9 10v1M15 10v1M12 10v3h-1M9 15.5s1 1 3 1 3-1 3-1" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">Skip the password next time?</p>
              <p className="mt-1 text-[13px] text-[color:var(--body)]">
                Turn on Face ID and this device signs you in with a look.
              </p>
            </div>
            <button
              onClick={acceptEnroll}
              disabled={busy}
              className="mo-primary h-12 w-full rounded-2xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? "Setting up…" : "Turn on Face ID"}
            </button>
            <button
              onClick={declineEnroll}
              className="text-[12px] font-medium text-[color:var(--body)]/70 transition hover:text-teal"
            >
              Not now
            </button>
          </div>
        )}

        {/* ---------- password form ---------- */}
        {mode === "password" && !offerEnroll && (
          <form
            onSubmit={handleSubmit}
            method="post"
            action="#"
            className="mo-card aiv-glow space-y-4 p-6 sm:p-7"
          >
            <label className="block" htmlFor="email">
              <span className="mb-1.5 block text-[12px] font-medium text-[color:var(--body)]">Email</span>
              <div className="flex items-center gap-2.5 rounded-2xl border border-[color:var(--border)] bg-white/[0.05] px-4 transition focus-within:border-teal focus-within:bg-white/[0.07] focus-within:shadow-glow">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[color:var(--body)]/60" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/></svg>
                <input
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  placeholder="you@momentumlandscapingut.com"
                  spellCheck={false}
                  className="h-12 w-full bg-transparent text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--body)]/40"
                />
              </div>
            </label>

            <label className="block" htmlFor="password">
              <span className="mb-1.5 block text-[12px] font-medium text-[color:var(--body)]">Password</span>
              <div className="flex items-center gap-2.5 rounded-2xl border border-[color:var(--border)] bg-white/[0.05] px-4 transition focus-within:border-teal focus-within:bg-white/[0.07] focus-within:shadow-glow">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[color:var(--body)]/60" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                <input
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-12 w-full bg-transparent text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--body)]/40"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1}
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--body)]/60 transition hover:text-teal">{showPw ? "Hide" : "Show"}</button>
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red/30 bg-red/10 px-3.5 py-2.5 text-[13px] text-red">
                <span className="mt-0.5">⚠</span>{error}
              </div>
            )}

            <button disabled={busy} className="mo-primary h-12 w-full rounded-2xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-60">
              {busy ? (
                <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Signing in…</span>
              ) : "Sign in"}
            </button>

            {savedEmail && (
              <button
                type="button"
                onClick={() => { setMode("biometric"); setError(""); }}
                className="w-full text-center text-[12px] font-medium text-[color:var(--body)]/70 transition hover:text-teal"
              >
                Use Face ID instead
              </button>
            )}

            <p className="pt-1 text-center text-[12px] text-[color:var(--body)]/60">Trouble signing in? Text Connor.</p>
          </form>
        )}

        <p className="mt-7 text-center text-[11px] text-[color:var(--body)]/45">
          © {new Date().getFullYear()} Momentum Landscaping LLC · Salt Lake &amp; Utah County
        </p>
      </div>
    </main>
  );
}
