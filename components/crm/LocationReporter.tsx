"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Location reporter — runs on every logged-in device.
 *
 * Uses the browser's geolocation API. The device reports its position on an
 * interval while the CRM is open; the server decides everything else
 * (which property, how long, whether it counts as service).
 */
export function LocationReporter({ intervalSeconds = 60 }: { intervalSeconds?: number }) {
  const [state, setState] = useState<"idle" | "on" | "denied" | "unsupported">("idle");
  const timer = useRef<any>(null);
  const deviceKey = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) { setState("unsupported"); return; }

    // Stable per-device id
    let key = window.localStorage.getItem("mo_device_key");
    if (!key) {
      key = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      window.localStorage.setItem("mo_device_key", key);
    }
    deviceKey.current = key;

    const report = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setState("on");
          try {
            await fetch("/api/tracking/ping", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                device_key: deviceKey.current,
                user_agent: navigator.userAgent.slice(0, 200),
                platform: (navigator as any).userAgentData?.platform ?? navigator.platform ?? null,
              }),
              keepalive: true,
            });
          } catch { /* offline — next tick retries */ }
        },
        (err) => { if (err.code === err.PERMISSION_DENIED) setState("denied"); },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
      );
    };

    report();
    timer.current = setInterval(report, intervalSeconds * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") report(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalSeconds]);

  if (state === "denied") {
    return (
      <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full border border-gold/40 bg-gold/15 px-4 py-2 text-[11px] font-medium text-gold shadow-pop md:bottom-4">
        Location is off — service visits won&apos;t auto-verify. Enable location for this site.
      </div>
    );
  }
  return null;
}
