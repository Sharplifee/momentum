"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import * as bio from "@/lib/biometric";

type Mode = "checking" | "biometric" | "password";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [resolvedEmail, setResolvedEmail] = useState("");
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

    // A crew member can sign in with just their name ("Peter Zaragoza"):
    // anything without an @ maps to name@momentumlandscapingut.com, which is
    // how name-only crew accounts are created. Real emails pass through as-is.
    const id = email.trim();
    const loginEmail = id.includes("@")
      ? id
      : `${id.toLowerCase().replace(/[^a-z0-9]/g, "")}@momentumlandscapingut.com`;
    const { data, error } = await client().auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error || !data.session) {
      setError("That email and password don't match — try again.");
      setBusy(false);
      return;
    }

    // Offer Face ID on any successful sign-in so the next visit is one tap.
    let declined = false;
    try { declined = localStorage.getItem("mo_bio_declined") === "1"; } catch {}

    if (canEnroll && !bio.isEnrolled() && !declined) {
      setPendingToken(data.session.refresh_token);
      setResolvedEmail(loginEmail);
      setOfferEnroll(true);
      setBusy(false);
      return;
    }
    window.location.href = "/crm";
  }

  async function acceptEnroll() {
    setBusy(true);
    if (pendingToken) await bio.enroll(resolvedEmail || email, pendingToken);
    window.location.href = "/crm";
  }

  function declineEnroll() {
    // Remember the refusal. Offering again on every sign-in turns a real
    // security prompt into noise people dismiss without reading.
    try { localStorage.setItem("mo_bio_declined", "1"); } catch {}
    window.location.href = "/crm";
  }

  const FaceIcon = (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-[color:var(--ink)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 10v1M15 10v1M12 10v3h-1M9 15.5s1 1 3 1 3-1 3-1" />
    </svg>
  );
  const field = "flex items-center gap-2.5 rounded-lg border border-[color:var(--border)] bg-[#0e0e0e] px-4 transition focus-within:border-white/30";
  const link = "text-[12px] font-medium text-[color:var(--body)] transition hover:text-[color:var(--ink)]";

  return (
    <main className="grid min-h-screen bg-[color:var(--bg)] lg:grid-cols-[1.1fr_1fr]">
      {/* ribbon panel — the brand's gradient layers, drawn in CSS */}
      <section className="mo-ribbon relative hidden min-h-screen lg:block">
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[20px] font-semibold tracking-[-0.04em] text-[color:var(--ink)]">Momentum<span className="ml-0.5 align-super text-[8px] font-medium tracking-normal text-[color:var(--body)]">©</span></span>
          </div>
          <div className="max-w-md">
            <h2 className="font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-[color:var(--ink)]">Every yard,<br />every week,<br />on time.</h2>
            <div className="mo-hairline mt-7 w-40" />
            <p className="mo-eyebrow mt-5 leading-[1.8]">Momentum Landscaping LLC<br />Operations · South Salt Lake Valley</p>
          </div>
        </div>
      </section>

      {/* door */}
      <section className="flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <img src="/logo-mark.png" alt="Momentum Landscaping" className="mb-4 h-10 w-10 object-contain" />
          </div>
          <div className="mo-eyebrow mb-3">Sign in</div>
          <h1 className="mo-h1 text-[30px]">Operations workspace</h1>
          <div className="mo-hairline-soft my-6" />

          {mode === "checking" && (
            <div className="mo-card flex items-center gap-2.5 p-5 text-[13px] text-[color:var(--body)]">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-[color:var(--ink)]" />
              Checking this device…
            </div>
          )}

          {/* ---------- Face ID door ---------- */}
          {mode === "biometric" && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-[color:var(--border)]">{FaceIcon}</div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-[color:var(--ink)]">Unlock with Face ID</p>
                  <p className="mt-0.5 truncate text-[13px] text-[color:var(--body)]">{savedEmail}</p>
                </div>
              </div>
              {error && (
                <div className="rounded-lg border border-red/40 px-3.5 py-2.5 text-[13px] text-red">{error}</div>
              )}
              <button onClick={runUnlock} disabled={busy} className="mo-primary h-12 w-full text-[14px] disabled:opacity-60">
                {busy ? "Unlocking…" : "Unlock"}
              </button>
              <button onClick={() => { setMode("password"); setError(""); }} className={link}>Use password instead</button>
            </div>
          )}

          {/* ---------- offer to turn Face ID on ---------- */}
          {offerEnroll && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-[color:var(--border)]">{FaceIcon}</div>
                <div>
                  <p className="text-[15px] font-medium text-[color:var(--ink)]">Lock Momentum with Face ID</p>
                  <p className="mt-0.5 text-[13px] text-[color:var(--body)]">Signs you in with a look, and keeps anyone else out of the business if this phone is left unlocked.</p>
                </div>
              </div>
              <button onClick={acceptEnroll} disabled={busy} className="mo-primary h-12 w-full text-[14px] disabled:opacity-60">
                {busy ? "Setting up…" : "Turn on Face ID"}
              </button>
              <button onClick={declineEnroll} className={link}>Not now</button>
            </div>
          )}

          {/* ---------- password form ---------- */}
          {mode === "password" && !offerEnroll && (
            <form onSubmit={handleSubmit} method="post" action="#" className="space-y-4">
              <label className="block" htmlFor="email">
                <span className="mo-eyebrow mb-2 block">Email or name</span>
                <div className={field}>
                  <input
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="text"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="Email or first and last name"
                    spellCheck={false}
                    className="h-12 w-full bg-transparent text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]"
                  />
                </div>
              </label>

              <label className="block" htmlFor="password">
                <span className="mo-eyebrow mb-2 block">Password</span>
                <div className={field}>
                  <input
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-12 w-full bg-transparent text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1} className="mo-eyebrow shrink-0 transition hover:text-[color:var(--ink)]">{showPw ? "Hide" : "Show"}</button>
                </div>
              </label>

              {error && (
                <div className="rounded-lg border border-red/40 px-3.5 py-2.5 text-[13px] text-red">{error}</div>
              )}

              <button disabled={busy} className="mo-primary h-12 w-full text-[14px] disabled:opacity-60">
                {busy ? "Signing in…" : "Sign in"}
              </button>

              {savedEmail && (
                <button type="button" onClick={() => { setMode("biometric"); setError(""); }} className={`${link} block w-full text-center`}>
                  Use Face ID instead
                </button>
              )}

              <p className="pt-1 text-[12px] text-[color:var(--faint)]">Trouble signing in? Text Connor.</p>
            </form>
          )}

          <div className="mt-10 flex items-center justify-between gap-4">
            <div className="mo-hairline-soft max-w-[120px]" />
            <p className="mo-eyebrow text-right text-[color:var(--faint)]">
              © {new Date().getFullYear()} Momentum Landscaping LLC
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
