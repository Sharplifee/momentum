import Link from "next/link";
import React from "react";

/** Matte hairline card. `line` adds the signature gradient hairline along the top edge. */
export function Card({ className = "", children, as: As = "div", line = false }: { className?: string; children: React.ReactNode; as?: any; line?: boolean }) {
  return <As className={`mo-card ${line ? "aiv-glow" : ""} p-5 ${className}`}>{children}</As>;
}

const BTN_BASE = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold tracking-[-0.01em] transition disabled:opacity-50";
const BTN_VARIANTS = {
  primary: "mo-primary",
  secondary: "border border-[color:var(--border-strong)] text-[color:var(--ink)] hover:border-white/30 hover:bg-white/[0.04]",
  ghost: "text-[color:var(--body)] hover:bg-white/[0.05] hover:text-[color:var(--ink)]",
  danger: "border border-red/50 text-red hover:bg-red/10",
} as const;

/** Primary (bone pill) / secondary (hairline) / ghost / danger. */
export function Button({
  variant = "primary", className = "", children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN_VARIANTS }) {
  return <button className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${className}`} {...props}>{children}</button>;
}

/** Link styled as a button. */
export function LinkButton({ href, variant = "primary", className = "", children }: { href: string; variant?: "primary" | "secondary" | "ghost"; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${className}`}>{children}</Link>;
}

/** Status/label chip — hairline pill. Pass color classes from the theme maps. */
export function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5 ${className}`}>{children}</span>;
}

/** Uppercase mono micro-label — the Sinky footer line, used as a section eyebrow. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mo-eyebrow ${className}`}>{children}</div>;
}

/** The signature gradient hairline. */
export function Hairline({ className = "", soft = false }: { className?: string; soft?: boolean }) {
  return <div aria-hidden className={`${soft ? "mo-hairline-soft" : "mo-hairline"} ${className}`} />;
}

/**
 * Page header: eyebrow (mono, uppercase) + display title + optional action,
 * with the gradient hairline drawn under the row. Breadcrumb renders in the
 * eyebrow slot so the page never carries two small-caps rows.
 */
export function PageHeader({ title, eyebrow, breadcrumb, action, sub }: {
  title: string; eyebrow?: string; breadcrumb?: { label: string; href: string }[]; action?: React.ReactNode; sub?: string;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav className="mo-eyebrow mb-2 flex items-center gap-1.5">
          {breadcrumb.map((b, i) => (
            <span key={b.href} className="flex items-center gap-1.5">
              <Link href={b.href} className="transition hover:text-[color:var(--ink)]">{b.label}</Link>
              {i < breadcrumb.length - 1 && <span className="text-[color:var(--faint)]">/</span>}
            </span>
          ))}
        </nav>
      ) : eyebrow ? (
        <Eyebrow className="mb-2">{eyebrow}</Eyebrow>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="mo-h1 text-[28px] sm:text-[32px]">{title}</h1>
          {sub && <p className="mt-1 text-[13px] text-[color:var(--body)]">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <Hairline soft />
    </div>
  );
}

/** Empty state on the ruled-card texture. */
export function EmptyState({ icon, title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mo-card mo-rule flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mo-eyebrow mb-1">{icon}</div>}
      <p className="font-display text-lg font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{title}</p>
      {hint && <p className="max-w-sm text-sm text-[color:var(--body)]">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Loading skeleton rows. */
export function Skeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mo-card flex items-center gap-4 p-4">
          <div className="mo-skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="mo-skeleton h-3 w-1/3" />
            <div className="mo-skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stat card: mono label, display numeral, hairline. Clicks through to a filtered list. */
export function StatCard({ label, value, href, icon, tone = "default" }: { label: string; value: React.ReactNode; href?: string; icon?: string; tone?: "default" | "win" | "warn" }) {
  const inner = (
    <div className="mo-card flex flex-col gap-3 p-4 transition hover:border-white/20">
      <div className="flex items-center justify-between">
        <span className="mo-eyebrow">{label}</span>
        {icon && <span className="text-sm text-[color:var(--faint)]">{icon}</span>}
      </div>
      <span className={`mo-num text-[28px] font-semibold leading-none ${tone === "win" ? "text-gold" : tone === "warn" ? "text-coral" : "text-[color:var(--ink)]"}`}>{value}</span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
