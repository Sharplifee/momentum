"use client";

import { useEffect, useState } from "react";

/* Same localStorage key TodayStops writes to and replays when signal returns. */
const QUEUE_KEY = "momentum_offline_queue";

/**
 * The amber strip under the header when the phone has no signal: one line of
 * what is happening, and how many taps are waiting to send. Renders nothing
 * while online. Mount it once in Shell, directly under the header.
 */
export function OfflineBanner({ className = "" }: { className?: string }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const readQueue = () => { try { setQueued((JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown[]).length); } catch { setQueued(0); } };
    const sync = () => { setOnline(navigator.onLine); readQueue(); };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("storage", readQueue);
    const t = setInterval(readQueue, 5000);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); window.removeEventListener("storage", readQueue); clearInterval(t); };
  }, []);

  if (online) return null;
  return (
    <div role="status" aria-live="polite"
      className={`flex items-center gap-2.5 border-b border-gold/40 px-4 py-[9px] md:px-6 ${className}`} style={{ background: "#1a1408" }}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-gold" />
      <span className="flex-1 text-[12.5px] text-[color:var(--ink)]">No signal · working from what&rsquo;s already loaded</span>
      <span className="mo-mono text-[11px] text-gold">{queued} queued</span>
    </div>
  );
}
