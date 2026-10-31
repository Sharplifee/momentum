"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as bio from "@/lib/biometric";

/**
 * Face ID on the way in, every time.
 *
 * Enrolment already existed, but it only did anything on the login page — so it
 * helped exactly when the session had expired and never otherwise. Someone
 * picking up an unlocked phone got straight into the business.
 *
 * This locks the CRM itself. On open, and again after the app has been away for
 * a while, nothing renders until Face ID passes.
 *
 * Deliberately not shown when nobody has enrolled: a gate that cannot be opened
 * is a wall. Enrolment happens at sign-in, and until then this stays out of the
 * way.
 */
const AWAY_MS = 5 * 60_000;   // long enough not to nag between screens
const KEY = "mo_bio_ok";

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hidden = useRef<number>(0);

  const pass = useCallback(() => {
    sessionStorage.setItem(KEY, String(Date.now()));
    setLocked(false);
    setFailed(false);
  }, []);

  const prompt = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const r = await bio.unlock();
    setBusy(false);
    if (r.ok) return pass();
    if (r.reason === "stale") {
      // The credential is gone from the device. Nothing here can recover it, so
      // send them to sign in again rather than trapping them behind a prompt
      // that will never succeed.
      bio.clearEnrollment();
      window.location.href = "/crm/login?reason=expired";
      return;
    }
    setFailed(true);   // cancelled — let them try again
  }, [busy, pass]);

  useEffect(() => {
    if (!bio.isEnrolled()) { setLocked(false); return; }
    const seen = Number(sessionStorage.getItem(KEY) ?? 0);
    if (seen && Date.now() - seen < AWAY_MS) {
      // Still in use: every screen refreshes the stamp, so the lock only
      // comes back after the app has actually been away, not after five
      // minutes of walking around inside it.
      sessionStorage.setItem(KEY, String(Date.now()));
      setLocked(false);
      return;
    }
    setLocked(true);
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-lock after the app has been in the background a while.
  useEffect(() => {
    const onVis = () => {
      if (!bio.isEnrolled()) return;
      if (document.visibilityState === "hidden") { hidden.current = Date.now(); return; }
      if (hidden.current && Date.now() - hidden.current > AWAY_MS) {
        setLocked(true);
        void prompt();
        return;
      }
      sessionStorage.setItem(KEY, String(Date.now()));   // back quickly — keep it fresh
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [prompt]);

  if (locked === null) return null;      // nothing flashes before we know
  if (!locked) return <>{children}</>;

  const email = bio.enrolledEmail();

  return (
    <div className="mo-rule-dots fixed inset-0 z-[100] flex flex-col bg-[color:var(--bg)] px-6"
      style={{ paddingTop: "max(24px, env(safe-area-inset-top))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
      <div className="flex items-center gap-2.5">
        <img src="/logo-mark.png" alt="" className="h-7 w-7 object-contain" />
        <span className="font-display text-[20px] font-semibold tracking-[-0.04em] text-[color:var(--ink)]">Momentum<span className="ml-0.5 align-super text-[8px] font-medium tracking-normal text-[color:var(--body)]">©</span></span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-7 grid h-28 w-28 place-items-center rounded-[26px] border border-[color:var(--border)] bg-[#121212]">
          <svg viewBox="0 0 24 24" className="h-12 w-12 text-[color:var(--ink)]" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
            <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
            <path d="M9 10v1M15 10v1M12 9v4M9.5 15.5a4 4 0 005 0" />
          </svg>
        </div>
        <div className="mo-eyebrow mb-2">Unlock</div>
        <h1 className="mo-h1 text-[30px]">{failed ? "Unlock cancelled" : "Look to open"}</h1>
        <p className="mt-2 text-[14px] text-[color:var(--body)]">Signed in as</p>
        {email && <p className="mt-0.5 max-w-full truncate px-4 text-[15px] text-[color:var(--ink)]">{email}</p>}
      </div>

      <div className="mx-auto w-full max-w-[380px]">
        <div className="mo-hairline-soft mb-5" />
        <button onClick={prompt} disabled={busy} className="mo-primary h-[52px] w-full text-[15px] disabled:opacity-60">
          {busy ? "Waiting…" : failed ? "Try Face ID again" : "Unlock"}
        </button>
        <button
          onClick={() => { bio.clearEnrollment(); window.location.href = "/crm/login"; }}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center text-[14px] text-[color:var(--body)] transition hover:text-[color:var(--ink)]"
        >
          Use password instead
        </button>
      </div>
    </div>
  );
}
