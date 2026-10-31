"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STAGE_NAME } from "@/lib/leadTimeline";

type LeadRef = { id: string; stage: string; full_name: string | null };

async function setStage(leadId: string, stage: string): Promise<string | null> {
  const res = await fetch("/api/crm/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, stage }) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? null : (json.error ?? "That didn't go through.");
}

/** Header-right coral outline: marks the lead not qualified, with an inline confirm. */
export function NotQualifiedButton({ lead }: { lead: LeadRef }) {
  const router = useRouter();
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (lead.stage === "not_qualified") return <span className="mo-eyebrow text-coral">Not qualified</span>;
  if (lead.stage === "closed_won") return null;
  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-[12px] text-coral">{err}</span>}
      {arm ? (
        <>
          <button type="button" onClick={() => setArm(false)} className="flex h-9 items-center rounded-full border border-[color:var(--border-strong)] px-3.5 text-[12.5px] font-semibold text-[color:var(--ink)]">Keep</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); const e = await setStage(lead.id, "not_qualified"); setErr(e); setBusy(false); if (!e) { setArm(false); router.refresh(); } }}
            className="flex h-9 items-center rounded-full border border-coral bg-coral/15 px-3.5 text-[12.5px] font-semibold text-coral disabled:opacity-50">{busy ? "…" : "Yes, not qualified"}</button>
        </>
      ) : (
        <button type="button" onClick={() => setArm(true)} className="flex h-9 items-center rounded-full border border-coral/50 px-3.5 text-[12.5px] font-semibold text-coral transition hover:bg-coral/10">Not qualified</button>
      )}
    </div>
  );
}

/** The three primary actions: Open thread · Build quote · Close won. */
export function LeadPills({ lead, threadHref }: { lead: LeadRef; threadHref: string }) {
  const router = useRouter();
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ghost = "flex h-11 flex-1 items-center justify-center rounded-full border border-teal/50 text-[13px] font-semibold text-[color:var(--ink)] transition hover:bg-white/[0.04]";
  const won = lead.stage === "closed_won";
  const dead = lead.stage === "not_qualified";
  return (
    <div>
      <div className="flex gap-2">
        <Link href={threadHref} className={ghost}>Open thread</Link>
        <Link href={`/crm/leads/${lead.id}/quote`} className={ghost}>Build quote</Link>
        {won ? (
          <span className="flex h-11 flex-1 items-center justify-center rounded-full border border-gold/50 text-[13px] font-semibold text-gold">Won</span>
        ) : arm ? (
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); const e = await setStage(lead.id, "closed_won"); setErr(e); setBusy(false); if (!e) { setArm(false); router.refresh(); } }}
            className="mo-primary flex h-11 flex-1 items-center justify-center rounded-full text-[13px] font-semibold disabled:opacity-50">{busy ? "Closing…" : "Confirm won"}</button>
        ) : (
          <button type="button" disabled={dead} onClick={() => setArm(true)} className="mo-primary flex h-11 flex-1 items-center justify-center rounded-full text-[13px] font-semibold disabled:opacity-40">Close won</button>
        )}
      </div>
      {arm && !busy && (
        <p className="mt-2 text-[12px] text-[color:var(--body)]">
          Creates the customer, the property with the checklist answers, and the service agreement.{" "}
          <button type="button" onClick={() => setArm(false)} className="text-teal">Cancel</button>
        </p>
      )}
      {err && <p className="mt-2 text-[12px] text-coral">{err}</p>}
    </div>
  );
}

const ALL_STAGES = ["new", "contacted", "quote_sent", "quote_scheduled", "closed_won", "not_qualified", "stale"];

/** Small Stage row inside the Request card — every other stage is one tap away. */
export function StageRow({ lead }: { lead: LeadRef }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="border-t border-[color:var(--border)] py-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[color:var(--body)]">Stage</span>
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[color:var(--ink)]">
          {STAGE_NAME[lead.stage] ?? lead.stage}
          <span className="mo-eyebrow text-teal">{open ? "Done" : "Change"}</span>
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALL_STAGES.map((s) => (
            <button key={s} type="button" disabled={s === lead.stage || Boolean(busy)}
              onClick={async () => { setBusy(s); const e = await setStage(lead.id, s); setErr(e); setBusy(""); if (!e) { setOpen(false); router.refresh(); } }}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${s === lead.stage ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)] hover:text-[color:var(--ink)]"} disabled:opacity-60`}>
              {busy === s ? "…" : STAGE_NAME[s]}
            </button>
          ))}
          {err && <span className="w-full text-[12px] text-coral">{err}</span>}
        </div>
      )}
    </div>
  );
}
