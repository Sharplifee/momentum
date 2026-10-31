"use client";

import { useEffect } from "react";

/**
 * Bottom sheet — the phone pattern every "new …" and "reschedule" flow in the
 * design uses: dimmed page behind, grab handle, Cancel / title row, scrolling
 * body, and a footer that stays put above the home indicator. On wide screens
 * it becomes a centered dialog so the same component serves both.
 */
export function Sheet({
  open, onClose, title, children, footer,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-[color:var(--border)] bg-[#121212] shadow-pop md:max-h-[86vh] md:max-w-[520px] md:rounded-[24px]">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 md:hidden" />
        <div className="flex items-center justify-between px-5 pb-3 pt-3">
          <button onClick={onClose} className="flex min-h-[44px] items-center text-[15px] text-[color:var(--body)]">Cancel</button>
          <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{title}</span>
          <span className="w-[52px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-[color:var(--border)] px-5 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Mono eyebrow + control, the sheet's field pattern. */
export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-4 ${className}`}>
      <div className="mo-eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

/** Segmented control — one selected bone pill inside a dark track. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full border border-[color:var(--border)] bg-black/30 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`min-w-0 flex-1 truncate rounded-full px-3 py-2 text-[13px] font-semibold transition ${value === o.value ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--body)]"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Row with a title, a line of help, and a glacier toggle. */
export function ToggleRow({ title, help, on, onChange }: { title: string; help?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="mb-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-3 text-left">
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-[color:var(--ink)]">{title}</div>
        {help && <div className="text-[12px] leading-snug text-[color:var(--body)]">{help}</div>}
      </div>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-teal" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-[#0a0a0a] transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export const INPUT = "w-full rounded-2xl border border-[color:var(--border)] bg-black/30 px-4 py-3 text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)] focus:border-white/30";
