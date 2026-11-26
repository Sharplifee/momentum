"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Location for service verification — asked ONCE per account, never again.
 *
 * Rules (each one closes a way the old reporter re-prompted on every open):
 *  1. Inside the Momentum Crew iPhone app the native shell already tracks with
 *     the OS permission iOS remembers forever. The web page never touches
 *     navigator.geolocation there — WKWebView does not remember a web grant
 *     between launches, which is what produced the prompt on every open.
 *  2. Only the crew view reports location. Office/admin use never asks.
 *  3. Nothing runs while the Face ID lock is up or before sign-in (this
 *     component only mounts inside the signed-in shell).
 *  4. The decision is stored on the account (/api/crm/location). The one
 *     system prompt happens only when the person taps "Turn on" in a one-time
 *     card. After that, reports run only when the browser says "granted" —
 *     a state in which no prompt can appear. Declined or forgotten: silence;
 *     More › Location is where it can be turned back on.
 */
type Consent = "granted" | "declined" | null;
const CACHE = "mo_loc_consent";

function inNativeShell() {
  return typeof window !== "undefined" && Boolean((window as any).ReactNativeWebView);
}

async function browserPermission(): Promise<PermissionState | "unknown"> {
  try {
    if (navigator.permissions?.query) return (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state;
  } catch {}
  return "unknown";
}

async function saveConsent(consent: Exclude<Consent, null>) {
  try { sessionStorage.setItem(CACHE, consent); } catch {}
  await fetch("/api/crm/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent, via: "web" }) }).catch(() => null);
}

/** Ask the browser exactly once, from a tap. Resolves to the decision. */
export function requestLocationOnce(): Promise<Exclude<Consent, null>> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve("declined");
    navigator.geolocation.getCurrentPosition(
      () => { void saveConsent("granted"); resolve("granted"); },
      (err) => {
        // Only an explicit "Don't Allow" is a decision; a timeout is not.
        if (err.code === err.PERMISSION_DENIED) { void saveConsent("declined"); resolve("declined"); }
        else { void saveConsent("granted"); resolve("granted"); }
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 },
    );
  });
}

export function LocationReporter({ role, intervalSeconds = 60 }: { role?: string; intervalSeconds?: number }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (role !== "crew" || inNativeShell() || !("geolocation" in navigator)) return;
    let cancelled = false;

    const startReporting = () => {
      let key = "";
      try {
        key = localStorage.getItem("mo_device_key") ?? "";
        if (!key) { key = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`; localStorage.setItem("mo_device_key", key); }
      } catch {}
      const report = async () => {
        if (document.visibilityState !== "visible") return;
        // Re-check every time: if the person revoked it in Settings we stop
        // instead of calling into a prompt.
        if ((await browserPermission()) !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            fetch("/api/tracking/ping", {
              method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
              body: JSON.stringify({
                lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed,
                device_key: key, user_agent: navigator.userAgent.slice(0, 200),
                platform: (navigator as any).userAgentData?.platform ?? navigator.platform ?? null,
              }),
            }).catch(() => null);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
        );
      };
      void report();
      const t = setInterval(report, intervalSeconds * 1000);
      const onVisible = () => { if (document.visibilityState === "visible") void report(); };
      document.addEventListener("visibilitychange", onVisible);
      stopRef.current = () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
    };

    const decide = async () => {
      // Wait for the Face ID lock to come down before anything.
      if (document.documentElement.classList.contains("mo-locked")) return;
      obs.disconnect();
      let consent: Consent = null;
      try { consent = (sessionStorage.getItem(CACHE) as Consent) || null; } catch {}
      if (!consent) {
        const r = await fetch("/api/crm/location", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        consent = r?.consent ?? null;
        if (consent) try { sessionStorage.setItem(CACHE, consent); } catch {}
      }
      if (cancelled) return;
      const perm = await browserPermission();
      if (perm === "granted") {
        if (consent !== "granted") void saveConsent("granted");
        return startReporting();
      }
      if (perm === "denied") { if (!consent) void saveConsent("declined"); return; }
      // Browser has no decision. Ask through our card only if the ACCOUNT has
      // never decided; otherwise stay silent — never a second prompt.
      if (!consent) setAsk(true);
      else if (consent === "granted" && perm === "unknown") startReporting(); // no Permissions API: the report() guard keeps it silent
    };

    const obs = new MutationObserver(() => { void decide(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    void decide();
    return () => { cancelled = true; obs.disconnect(); stopRef.current(); };
  }, [role, intervalSeconds]);

  if (!ask) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-40 mx-auto max-w-md rounded-2xl border border-[color:var(--border)] bg-[#121212] p-4 shadow-pop md:bottom-4 md:left-auto md:right-4 md:mx-0">
      <div className="text-[15px] font-semibold text-[color:var(--ink)]">Turn on location for service visits?</div>
      <p className="mt-1 text-[13px] leading-snug text-[color:var(--body)]">It confirms you arrived at each property so nobody checks in by hand. You'll be asked once, and it's saved to your account.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} className="mo-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-50"
          onClick={async () => { setBusy(true); const r = await requestLocationOnce(); setAsk(false); setBusy(false); if (r === "granted") location.reload(); }}>
          Turn on
        </button>
        <button type="button" disabled={busy} className="rounded-full border border-[color:var(--border)] px-4 py-2.5 text-[14px] text-[color:var(--body)]"
          onClick={() => { void saveConsent("declined"); setAsk(false); }}>
          Not now
        </button>
      </div>
    </div>
  );
}
