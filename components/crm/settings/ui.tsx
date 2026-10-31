import Link from "next/link";
import React from "react";

/* Shared pieces for the Settings / More / Account screens. Server-safe: no hooks.
   The patterns come straight from the design canvas — a matte card of 52px
   rows, a status dot at the left, a chevron at the right, mono values. */

export const CHEVRON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[color:var(--faint)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
);

export type Tone = "sage" | "gold" | "coral" | "faint";
const DOT: Record<Tone, string> = { sage: "bg-sage", gold: "bg-gold", coral: "bg-coral", faint: "bg-white/20" };
const TEXT: Record<Tone, string> = { sage: "text-sage", gold: "text-gold", coral: "text-coral", faint: "text-[color:var(--faint)]" };

/** 8px status dot. Green = live, amber = needs you, coral = broken, faint = off. */
export function Dot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[tone]} ${className}`} />;
}

/** Mono micro-label in a status colour — "ALWAYS", "ON", "2 OVERDUE". */
export function Tag({ tone = "faint", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`mo-eyebrow shrink-0 text-[9px] ${TEXT[tone]}`}>{children}</span>;
}

/** The checklist mark: green ✓ or amber ! in a thin ring. */
export function Check({ ok }: { ok: boolean }) {
  return (
    <span aria-label={ok ? "done" : "needs you"} className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-sage/20 text-sage" : "border border-gold/60 text-gold"}`}>
      {ok ? "✓" : "!"}
    </span>
  );
}

/** Card that stacks `Row`s with hairlines between them. */
export function RowCard({ children, className = "", line = false }: { children: React.ReactNode; className?: string; line?: boolean }) {
  return <div className={`mo-card ${line ? "aiv-glow" : ""} divide-y divide-[color:var(--border)] p-0 ${className}`}>{children}</div>;
}

/**
 * One 52px row: optional leading slot (icon / dot / avatar), a label with an
 * optional second line, a trailing slot (value, tag, toggle), and a chevron
 * when it links somewhere.
 */
export function Row({ href, onClick, lead, label, sub, trail, chevron, className = "", muted = false }: {
  href?: string; onClick?: () => void; lead?: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode;
  trail?: React.ReactNode; chevron?: boolean; className?: string; muted?: boolean;
}) {
  const inner = (
    <>
      {lead !== undefined && <span className="inline-grid min-w-[22px] shrink-0 place-items-center text-[color:var(--body)]">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-medium ${muted ? "text-[color:var(--body)]" : "text-[color:var(--ink)]"}`}>{label}</span>
        {sub && <span className="mt-0.5 block text-[12px] leading-snug text-[color:var(--body)]">{sub}</span>}
      </span>
      {trail}
      {(chevron ?? Boolean(href)) && CHEVRON}
    </>
  );
  const cls = `flex min-h-[52px] w-full items-center gap-3.5 px-4 py-3 text-left transition ${href || onClick ? "hover:bg-white/[0.03]" : ""} ${className}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** Eyebrow above a group of rows. */
export function Group({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mo-eyebrow mb-2">{label}</div>
      {children}
    </section>
  );
}

/** The faint centred mono footnote the design puts under each screen. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="mo-eyebrow mt-2 text-center leading-[1.7] text-[color:var(--faint)]">{children}</p>;
}

/** Two-letter initials in a bone circle (the account avatar). */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = (name || "?").split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[color:var(--ink)] font-semibold text-[#0a0a0a]" style={{ width: size, height: size, fontSize: Math.round(size * 0.31) }}>
      {initials}
    </span>
  );
}

/** "(385) ···-··35" — enough to recognise a number, not enough to copy it. */
export function maskPhone(p: string | null | undefined): string {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length < 10) return p ?? "—";
  const n = d.slice(-10);
  return `(${n.slice(0, 3)}) ···-··${n.slice(8)}`;
}

/** "weekly-mow" / "booking_confirmed" → "Weekly mow" / "Booking confirmed". */
export function titleCase(s: string): string {
  const t = s.replace(/[-_]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : s;
}
