"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Footer of the job sheet: Cancel visit on the left, the one primary action on
 * the right (Start job → Mark done). Cancel asks once, inline — never a
 * browser dialog.
 */
export function JobActions({ jobId, status, isToday }: { jobId: string; status: string; isToday: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true); setErr(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setErr("Didn't save — try again."); return false; }
    router.refresh();
    return true;
  }

  if (status === "completed" || status === "cancelled") return null;

  const primary = status === "in_progress"
    ? { label: "Mark done", run: () => post("/api/crm/clock", { event: "departed", job_id: jobId }) }
    : { label: isToday ? "Start job" : "Start early", run: () => post("/api/crm/clock", { event: "arrived", job_id: jobId }) };

  return (
    <div className="fixed inset-x-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:px-0 md:py-0"
      style={{ bottom: "calc(62px + env(safe-area-inset-bottom))" }}>
      {err && <div className="mb-2 text-center text-[12px] text-coral">{err}</div>}
      <div className="mx-auto flex max-w-3xl gap-3">
        {confirmCancel ? (
          <>
            <button disabled={busy} onClick={async () => { if (await post("/api/crm/jobs", { action: "cancel", job_id: jobId })) setConfirmCancel(false); }}
              className="flex-1 rounded-full border border-coral/60 py-3.5 text-[15px] font-semibold text-coral">Yes, cancel it</button>
            <button onClick={() => setConfirmCancel(false)} className="flex-1 rounded-full border border-[color:var(--border-strong)] py-3.5 text-[15px] font-semibold text-[color:var(--ink)]">Keep it</button>
          </>
        ) : (
          <>
            <button onClick={() => setConfirmCancel(true)} className="flex-[0.8] rounded-full border border-coral/50 py-3.5 text-[15px] font-semibold text-coral">Cancel visit</button>
            <button disabled={busy} onClick={primary.run} className="mo-primary flex-1 rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-50">{busy ? "…" : primary.label}</button>
          </>
        )}
      </div>
    </div>
  );
}
