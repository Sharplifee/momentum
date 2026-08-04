"use client";

import { useEffect } from "react";

/**
 * Bridge between the native customer shell and the portal.
 *
 * The shell is a webview around this site, so the portal already owns the
 * signed-in session. Rather than duplicating auth natively, the shell just
 * hands over the APNs device token it got from iOS and lets the page register
 * it with the cookie session it already has. Nothing here runs in a browser —
 * the callback is only ever invoked by the wrapper.
 *
 * The shell may inject before or after hydration, so both orders are handled:
 * an early injection parks itself on window.__momentumPush and gets picked up
 * here; a late one calls window.momentumRegisterPush directly.
 */
export function PushBridge() {
  useEffect(() => {
    const w = window as any;

    async function register(token: string, bundleId?: string, appVersion?: string) {
      if (!token) return;
      try {
        await fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            platform: "ios",
            bundle_id: bundleId,
            app_version: appVersion,
          }),
        });
      } catch {
        // The shell re-injects on every load, so a dropped registration
        // fixes itself next launch. Nothing worth showing the customer.
      }
    }

    w.momentumRegisterPush = register;
    const pending = w.__momentumPush;
    if (pending?.token) register(pending.token, pending.bundleId, pending.appVersion);

    return () => {
      delete w.momentumRegisterPush;
    };
  }, []);

  return null;
}
