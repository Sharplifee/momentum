"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Dismiss (resolve) on the left; the primary way out on the right. */
export function ExceptionActions({ id, resolved, jobId }: { id: number; resolved: boolean; jobId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setResolved(action?: "reopen") {
    setBusy(true);
    await fetch("/api/crm/exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    setBusy(false);
    router.refresh();
  }

  if (resolved) {
    return (
      <div className="flex gap-3 pb-6">
        <button onClick={() => setResolved("reopen")} disabled={busy} className="flex-1 rounded-full border border-[color:var(--border-strong)] py-3.5 text-[15px] font-semibold text-[color:var(--ink)] disabled:opacity-50">{busy ? "…" : "Reopen"}</button>
        <Link href="/crm/tracker" className="mo-primary grid flex-1 place-items-center rounded-full py-3.5 text-[15px] font-semibold">Back to Tracker</Link>
      </div>
    );
  }
  return (
    <div className="flex gap-3 pb-6">
      <button onClick={() => setResolved()} disabled={busy} className="flex-[0.8] rounded-full border border-teal/50 py-3.5 text-[15px] font-semibold text-[color:var(--ink)] disabled:opacity-50">{busy ? "…" : "Dismiss"}</button>
      {jobId
        ? <Link href={`/crm/jobs/${jobId}`} className="mo-primary grid flex-1 place-items-center rounded-full py-3.5 text-[15px] font-semibold">Reschedule &amp; notify</Link>
        : <button onClick={() => setResolved()} disabled={busy} className="mo-primary flex-1 rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-50">Resolve</button>}
    </div>
  );
}
