"use client";

import { useEffect, useMemo, useState } from "react";

/** Gradient response clock per brief: fills to target seconds, turns danger when past. */
export function ResponseClock({ createdAt, targetSeconds = 300 }: { createdAt: string; targetSeconds?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const ageMs = useMemo(() => Math.max(0, now - new Date(createdAt).getTime()), [now, createdAt]);
  const ageS = Math.round(ageMs / 1000);
  const ratio = Math.min(1, ageS / targetSeconds);
  const over = ageS > targetSeconds;
  const label = `Waiting ${ageS < 3600 ? `${Math.max(1, Math.floor(ageS / 60))} minutes` : `${Math.floor(ageS / 3600)} hours`}`;
  return (
    <div className="mt-1.5">
      <div className="h-[2px] w-full rounded-full bg-[color:var(--border)]" role="progressbar" aria-label={label} aria-valuenow={Math.min(100, Math.round(ratio * 100))} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full origin-left rounded-full ${over ? "bg-danger" : ""}`} style={{ width: `${ratio * 100}%`, background: over ? undefined : "var(--grad)" }} />
      </div>
      {over && <span className="mo-eyebrow mt-0.5 inline-block text-danger">{`${Math.max(1, Math.floor(ageS / 60))}m · past 5‑min target`}</span>}
    </div>
  );
}
