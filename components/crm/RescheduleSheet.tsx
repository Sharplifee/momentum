"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Field, Segmented, ToggleRow, INPUT } from "./Sheet";

export type DayOption = { iso: string; dow: string; num: number; note: string; tone: "open" | "route" | "rain" | "full" };

const WINDOWS = [
  { value: "07:00-09:00", label: "7–9" },
  { value: "09:00-11:00", label: "9–11" },
  { value: "11:00-13:00", label: "11–1" },
  { value: "13:00-15:00", label: "1–3" },
];

const TONE: Record<DayOption["tone"], string> = {
  open: "text-[color:var(--body)]",
  route: "text-teal",
  rain: "text-gold",
  full: "text-coral",
};

/**
 * Reschedule: pick one of the next workable days (each labelled with why it
 * is or isn't a good fit), a window, an optional reason, and whether the
 * customer gets told. One tap moves it.
 */
export function RescheduleSheet({ jobId, customerFirst, days, currentWindow, open, onClose }: {
  jobId: string; customerFirst: string; days: DayOption[]; currentWindow: string | null; open: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const first = days.find((d) => d.tone !== "full") ?? days[0];
  const [day, setDay] = useState<string>(first?.iso ?? "");
  const [win, setWin] = useState<string>(WINDOWS.find((w) => w.value.startsWith(currentWindow ?? ""))?.value ?? WINDOWS[1].value);
  const [reason, setReason] = useState("");
  const [text, setText] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chosen = days.find((d) => d.iso === day);
  const label = chosen ? `${chosen.dow}, ${new Date(chosen.iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
  const winLabel = WINDOWS.find((w) => w.value === win)?.label ?? "";

  async function move() {
    if (!day || busy) return;
    setBusy(true); setErr(null);
    const [ws, we] = win.split("-");
    const res = await fetch("/api/crm/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reschedule", job_id: jobId, scheduled_date: day, window_start: ws, window_end: we, reason: reason.trim() || null, text_customer: text }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error === "day_full" ? "That day is at capacity for this crew." : (j.error ?? "Couldn't move it — try again.")); return; }
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Reschedule"
      footer={
        <>
          {err && <div className="mb-2 text-center text-[12px] text-coral">{err}</div>}
          <button onClick={move} disabled={!day || busy} className="mo-primary w-full rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40">
            {busy ? "Moving…" : `Move to ${label}`}
          </button>
        </>
      }>
      <Field label="Move to">
        <div className="grid grid-cols-4 gap-2">
          {days.map((d) => (
            <button key={d.iso} type="button" onClick={() => setDay(d.iso)}
              className={`rounded-2xl border px-1 py-3 text-center transition ${day === d.iso ? "border-teal bg-teal/[0.06]" : "border-[color:var(--border)]"}`}>
              <div className={`mo-eyebrow ${day === d.iso ? "text-teal" : ""}`}>{d.dow}</div>
              <div className="font-display text-[22px] font-bold leading-tight text-[color:var(--ink)]">{d.num}</div>
              <div className={`text-[11px] ${TONE[d.tone]}`}>{d.note}</div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Window">
        <Segmented options={WINDOWS} value={win} onChange={setWin} />
      </Field>
      <Field label="Reason · optional">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer asked, weather, crew out…" className={INPUT} />
      </Field>
      <ToggleRow title="Text the customer" help={`"${customerFirst ? customerFirst + ", " : ""}moved to ${label}, ${winLabel} — reply if that doesn't work"`} on={text} onChange={setText} />
    </Sheet>
  );
}

export function RescheduleButton(props: Omit<React.ComponentProps<typeof RescheduleSheet>, "open" | "onClose"> & { className?: string }) {
  const [open, setOpen] = useState(false);
  const { className = "", ...rest } = props;
  return (
    <>
      <button onClick={() => setOpen(true)} className={`rounded-full border border-teal/50 px-4 py-1.5 text-[13px] font-semibold text-[color:var(--ink)] transition hover:border-teal ${className}`}>Reschedule</button>
      <RescheduleSheet {...rest} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
