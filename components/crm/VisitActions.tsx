"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Footer of a finished visit: text the customer, or flag the visit for review (inline note, no dialogs). */
export function VisitActions({ jobId, threadHref, alreadyFlagged }: { jobId: string; threadHref: string | null; alreadyFlagged: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadyFlagged);

  async function flag() {
    setBusy(true);
    const res = await fetch("/api/crm/exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "flag", job_id: jobId, note }) });
    setBusy(false);
    if (res.ok) { setDone(true); setOpen(false); router.refresh(); }
  }

  return (
    <div className="mt-4">
      {open && !done && (
        <div className="mb-3 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should be looked at?" autoFocus
            className="min-w-0 flex-1 rounded-full border border-[color:var(--border)] bg-black/30 px-4 py-2.5 text-[14px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]" />
          <button onClick={flag} disabled={busy} className="mo-primary rounded-full px-4 text-[13px] disabled:opacity-50">{busy ? "…" : "Flag"}</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {threadHref ? (
          <Link href={threadHref} className="grid min-h-[52px] place-items-center rounded-full border border-teal/50 text-[15px] font-semibold text-[color:var(--ink)]">Text customer</Link>
        ) : <span className="grid min-h-[52px] place-items-center rounded-full border border-[color:var(--border)] text-[15px] text-[color:var(--faint)]">No phone on file</span>}
        <button onClick={() => setOpen(!open)} disabled={done}
          className={`grid min-h-[52px] place-items-center rounded-full border text-[15px] font-semibold ${done ? "border-gold/50 text-gold" : "border-teal/50 text-[color:var(--ink)]"}`}>
          {done ? "Flagged" : "Flag this visit"}
        </button>
      </div>
    </div>
  );
}
