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
      window.location.href = "/crm/login";
      return;
    }
    setFailed(true);   // cancelled — let them try again
  }, [busy, pass]);

  useEffect(() => {
    if (!bio.isEnrolled()) { setLocked(false); return; }
    const seen = Number(sessionStorage.getItem(KEY) ?? 0);
    if (seen && Date.now() - seen < AWAY_MS) { setLocked(false); return; }
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
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [prompt]);

  if (locked === null) return null;      // nothing flashes before we know
  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[color:var(--bg)] px-6">
      <div className="w-full max-w-[300px] text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-ice/12">
          <svg viewBox="0 0 24 24" className="h-8 w-8 stroke-teal" fill="none"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
            <path d="M9 10v1M15 10v1M12 9v4M9.5 15.5a4 4 0 005 0" />
          </svg>
        </div>
        <h1 className="font-display text-2xl">Momentum</h1>
        <p className="mt-1.5 text-sm text-[color:var(--body)]">
          {failed ? "Unlock cancelled." : "Unlocking with Face ID…"}
        </p>

        <button
          onClick={prompt}
          disabled={busy}
          className="mt-6 min-h-[48px] w-full rounded-xl bg-teal text-base font-semibold text-navy disabled:opacity-60"
        >
          {busy ? "Waiting…" : failed ? "Try Face ID again" : "Use Face ID"}
        </button>

        <button
          onClick={() => { bio.clearEnrollment(); window.location.href = "/crm/login"; }}
          className="mt-3 min-h-[44px] w-full text-sm text-[color:var(--body)] underline decoration-ice/30 underline-offset-4"
        >
          Use my password instead
        </button>
      </div>
    </div>
  );
}
