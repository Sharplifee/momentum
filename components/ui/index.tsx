import Link from "next/link";
import React from "react";

/** Frosted brand card. */
export function Card({ className = "", children, as: As = "div" }: { className?: string; children: React.ReactNode; as?: any }) {
  return <As className={`mo-card p-5 ${className}`}>{children}</As>;
}

/** Primary/secondary/ghost button — teal primary, brand hovers. */
export function Button({
  variant = "primary", className = "", children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50";
  const variants = {
    primary: "mo-primary shadow-card",
    secondary: "bg-white/70 text-navy border border-[color:var(--border)] hover:bg-white dark:bg-white/10 dark:text-ice",
    ghost: "text-slate hover:bg-ice/15",
    danger: "bg-red/10 text-red hover:bg-red/20",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

/** Link styled as a button. */
export function LinkButton({ href, variant = "primary", className = "", children }: { href: string; variant?: "primary" | "secondary" | "ghost"; className?: string; children: React.ReactNode }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition";
  const variants = {
    primary: "mo-primary shadow-card",
    secondary: "bg-white/70 text-navy border border-[color:var(--border)] hover:bg-white dark:bg-white/10 dark:text-ice",
    ghost: "text-slate hover:bg-ice/15",
  };
  return <Link href={href} className={`${base} ${variants[variant]} ${className}`}>{children}</Link>;
}

/** Status/label chip. Pass full color classes from theme maps. */
export function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

/** Page header: H1 + optional breadcrumb + primary action slot. */
export function PageHeader({ title, breadcrumb, action }: { title: string; breadcrumb?: { label: string; href: string }[]; action?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-1 flex items-center gap-1 text-xs text-slate">
          {breadcrumb.map((b, i) => (
            <span key={b.href} className="flex items-center gap-1">
              <Link href={b.href} className="hover:text-teal">{b.label}</Link>
              {i < breadcrumb.length - 1 && <span>›</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="mo-h1 text-2xl">{title}</h1>
        {action}
      </div>
    </div>
  );
}

/** Friendly empty state with a primary action. */
export function EmptyState({ icon = "🌱", title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mo-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="font-display text-lg text-navy dark:text-ice">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Loading skeleton rows. */
export function Skeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mo-card flex items-center gap-4 p-4">
          <div className="mo-skeleton h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="mo-skeleton h-3 w-1/3" />
            <div className="mo-skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stat card that clicks through to a filtered list. */
export function StatCard({ label, value, href, icon, tone = "default" }: { label: string; value: React.ReactNode; href?: string; icon?: string; tone?: "default" | "win" }) {
  const inner = (
    <div className="mo-card flex flex-col gap-1 p-4 transition hover:shadow-pop">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate">{label}</span>
        {icon && <span className="text-base opacity-70">{icon}</span>}
      </div>
      <span className={`font-display text-2xl font-bold ${tone === "win" ? "text-[oklch(0.55_0.10_70)] dark:text-gold" : "text-navy dark:text-ice"}`}>{value}</span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
