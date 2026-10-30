"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Keeps every CRM page live without a reload.
 *
 * Pages are server-rendered from the database on each request, so the numbers
 * are always real — but only as of the moment the page opened. This re-fetches
 * the server component tree every 30 s while the tab is visible, and the
 * instant the app comes back to the foreground (the crew's phones spend most of
 * the day backgrounded in a pocket). router.refresh() keeps scroll position
 * and any form state; it only swaps the data.
 */
const INTERVAL_MS = 30_000;

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const last = useRef(Date.now());

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      last.current = Date.now();
      router.refresh();
    };
    const tick = setInterval(refresh, INTERVAL_MS);
    const onVisible = () => {
      // Came back after being hidden: refresh at once if the data is older than
      // a few seconds, rather than waiting for the next tick.
      if (document.visibilityState === "visible" && Date.now() - last.current > 5_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [router, pathname]);

  return null;
}
