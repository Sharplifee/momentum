import Link from "next/link";
import { brand, SERIES } from "@/lib/theme";

/* ===== Momentum chart kit — pure-SVG server components =====
   One rule: a chart should be readable by anyone on a phone in two seconds.
   Lines and bars are one flat accent colour; the gradient ribbon is ornament
   (hairlines, tab marks), never data. The "no data yet" state is an honest
   flat line, never an invented curve. */

/** Gradient defs shared by every chart; ids are scoped per instance. */
function GradDefs({ id, vertical = false }: { id: string; vertical?: boolean }) {
  return (
    <defs>
      {/* Lines are one flat colour now — the five-stop ribbon stays on hairlines
          and tab indicators, where it is ornament, not data. */}
      <linearGradient id={`${id}-line`} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
        <stop offset="0%" stopColor={brand.sea} />
        <stop offset="100%" stopColor={brand.sea} />
      </linearGradient>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={brand.sea} stopOpacity="0.22" />
        <stop offset="100%" stopColor={brand.sea} stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/** A stat tile with a one-line title, the number, a short note, and a slot
    for one of the simple visuals below. Titles must be short enough never to
    wrap at phone width — pick the label accordingly. */
export function Tile({ label, value, note, href, children }: {
  label: string; value: string | number; note?: string; href?: string; children?: React.ReactNode;
}) {
  const body = (
    <div className="mo-card flex h-full flex-col gap-3 p-4 transition hover:border-white/20">
      <span className="mo-eyebrow whitespace-nowrap">{label}</span>
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="mo-num text-[28px] font-semibold leading-none text-[color:var(--ink)]">{value}</span>
        {note && <span className="mo-mono text-[11px] text-[color:var(--body)]">{note}</span>}
      </div>
      {children}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** Two bars: this period against the last one. Reads as "more or fewer than last week" at a glance. */
export function CompareBars({ a, b, aLabel = "This wk", bLabel = "Last wk" }: { a: number; b: number; aLabel?: string; bLabel?: string }) {
  const max = Math.max(1, a, b);
  const row = (label: string, v: number, strong: boolean) => (
    <div className="flex items-center gap-2">
      <span className={`mo-eyebrow w-11 text-[8px] ${strong ? "text-[color:var(--ink)]" : ""}`}>{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: strong ? brand.sea : "rgba(122,193,201,0.35)" }} />
      </span>
      <span className={`mo-mono w-4 text-right text-[10px] ${strong ? "text-[color:var(--ink)]" : "text-[color:var(--body)]"}`}>{v}</span>
    </div>
  );
  return <div className="flex h-[38px] flex-col justify-center gap-1.5" role="img" aria-label={`${a} ${aLabel.toLowerCase()}, ${b} ${bLabel.toLowerCase()}`}>{row(aLabel, a, true)}{row(bLabel, b, false)}</div>;
}

/** Seven days with the count on each: which days have work, and how much. */
export function DayStrip({ counts, labels, title }: { counts: number[]; labels: string[]; title: string }) {
  return (
    <div className="flex h-[38px] items-end gap-[3px]" role="img" aria-label={`${title}: ${counts.map((c, i) => `${labels[i]} ${c}`).join(", ")}`}>
      {counts.map((c, i) => (
        <span key={i} className="flex flex-1 flex-col items-center gap-[3px]">
          <span className={`mo-mono text-[11px] ${c ? "text-[color:var(--ink)]" : "text-[color:var(--faint)]"}`}>{c || "·"}</span>
          <span className="h-1.5 w-full rounded-[2px]" style={{ background: c ? brand.sea : "rgba(255,255,255,0.08)" }} />
          <span className={`mo-eyebrow text-[8px] ${c ? "text-[color:var(--ink)]" : "text-[color:var(--faint)]"}`}>{labels[i]}</span>
        </span>
      ))}
    </div>
  );
}

/** One flat trend line with a dot on the latest value. */
export function TrendLine({ points, label }: { points: number[]; label: string }) {
  const has = points.length > 1 && points.some((p) => p > 0);
  const max = Math.max(1, ...points);
  const n = Math.max(1, points.length - 1);
  const xy = points.map((v, i) => [(i * 100) / n, 27 - (v / max) * 21] as const);
  const d = has ? `M${xy.map(([x, y]) => `${x},${y}`).join(" L")}` : "M0,27 L100,27";
  const last = xy[xy.length - 1] ?? [100, 27];
  return (
    <svg viewBox="0 0 100 30" className="h-[38px] w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} fill="none" stroke={has ? brand.sea : "rgba(255,255,255,0.14)"} strokeWidth={has ? 2 : 1} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {has && <circle cx={last[0]} cy={last[1]} r="2.4" fill={brand.ink} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function DeltaTile({ label, value, delta, up = true, icon, href, seed = 1, points }: {
  label: string; value: string | number; delta?: string; up?: boolean; icon?: string; href?: string; seed?: number; points?: number[];
}) {
  let d: string;
  let hasData = false;
  if (points && points.length > 1 && points.some((p) => p > 0)) {
    hasData = true;
    const max = Math.max(...points);
    const n = points.length - 1;
    d = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * 100) / n},${46 - (v / max) * 36}`).join(" ");
  } else {
    d = "M0,44 L100,44"; // honest flat baseline — no data yet
  }
  const id = `dt${seed}`;
  const body = (
    <div className="mo-card flex flex-col gap-3 p-4 transition hover:border-white/20">
      <div className="flex items-center justify-between gap-2">
        <span className="mo-eyebrow min-w-0 truncate">{label}</span>
        {icon && <span className="shrink-0 text-[12px] text-[color:var(--faint)]">{icon}</span>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="mo-num text-[30px] font-semibold leading-none text-[color:var(--ink)]">{value}</span>
        {delta && <span className={`mo-mono text-[11px] ${up ? "text-sage" : "text-coral"}`}>{delta}</span>}
      </div>
      <svg viewBox="0 0 100 50" className="h-9 w-full" preserveAspectRatio="none">
        <GradDefs id={id} />
        {hasData && <path d={`${d} L100,50 L0,50 Z`} fill={`url(#${id}-fill)`} />}
        <path d={d} fill="none" stroke={hasData ? `url(#${id}-line)` : "rgba(255,255,255,0.14)"} strokeWidth={hasData ? 1.6 : 1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function FunnelChart({ stages }: { stages: { k: string; v: number; c: string; href?: string }[] }) {
  const W = 200, layerH = 30, gap = 3;

  // A funnel must never widen. Each band is sized by how many are still in play
  // at that stage or beyond, so the shape only ever narrows — and the count
  // printed on it stays the real number.
  const remaining = stages.map((_, i) =>
    stages.slice(i).reduce((sum, s) => sum + s.v, 0)
  );
  const top = Math.max(1, remaining[0]);
  const widths = remaining.map((r, i) => {
    const share = r / top;
    const floor = 0.26 - i * 0.02;
    return W * Math.max(floor, 0.30 + 0.66 * share);
  });
  return (
    <div className="flex items-center gap-5">
      <svg viewBox={`0 0 ${W} ${stages.length * (layerH + gap)}`} className="h-36 w-44 shrink-0">
        {stages.map((s, i) => {
          const topW = widths[i];
          const botW = Math.min(topW, widths[i + 1] ?? topW * 0.6);
          const y = i * (layerH + gap);
          const x1 = (W - topW) / 2, x2 = (W - botW) / 2;
          const dark = s.c === brand.bone || s.c === brand.amber || s.c === "#8fd0c6";
          return (
            <g key={s.k}>
              <path d={`M${x1},${y} L${x1 + topW},${y} L${x2 + botW},${y + layerH} L${x2},${y + layerH} Z`}
                fill={s.c} opacity={s.v === 0 ? 0.18 : 0.95} />
              {s.v > 0 && <text x={W / 2} y={y + layerH / 2 + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={dark ? "#0a0a0a" : "#0a0a0a"}>{s.v}</text>}
            </g>
          );
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2.5 text-sm">
        {stages.map((s) => {
          const row = (
            <span className="flex w-full items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.c }} />
              <span className="truncate text-[color:var(--body)]">{s.k}</span>
              <span className={`mo-mono ml-auto text-[13px] ${s.v ? "text-[color:var(--ink)]" : "text-[color:var(--faint)]"}`}>{s.v}</span>
            </span>
          );
          return s.href ? <Link key={s.k} href={s.href} className="block transition hover:brightness-125">{row}</Link> : <div key={s.k}>{row}</div>;
        })}
      </div>
    </div>
  );
}

export function AreaChart({ points, height = 96, label }: { points: number[]; height?: number; label?: string }) {
  const peakValue = points.length ? Math.max(...points) : 0;
  const max = Math.max(1, peakValue);
  const peak = peakValue > 0 ? points.indexOf(peakValue) : -1;
  const n = Math.max(1, points.length - 1);
  const xy = points.map((v, i) => [(i * 100) / n, 46 - (v / max) * 38] as const);
  const d = `M${xy.map(([x, y]) => `${x},${y}`).join(" L")}`;
  const id = "area";
  return (
    <div>
      <svg viewBox="0 0 100 50" style={{ height }} className="w-full" preserveAspectRatio="none">
        <GradDefs id={id} />
        {[10, 22, 34].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" strokeDasharray="0.8 1.6" />)}
        <path d={`${d} L100,50 L0,50 Z`} fill={`url(#${id}-fill)`} />
        <path d={d} fill="none" stroke={`url(#${id}-line)`} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {peak >= 0 && (
          <g>
            <line x1={xy[peak][0]} x2={xy[peak][0]} y1={xy[peak][1]} y2={48} stroke={brand.bone} strokeOpacity="0.5" strokeWidth="0.4" strokeDasharray="1 1.5" />
            <circle cx={xy[peak][0]} cy={xy[peak][1]} r="2" fill="#0a0a0a" stroke={brand.bone} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <div className="mt-1.5 flex items-center justify-between">
        {label && <div className="mo-mono text-[11px] text-[color:var(--body)]">{label}</div>}
        {peak >= 0 && <div className="mo-mono text-[11px] text-[color:var(--body)]">peak {peakValue}</div>}
      </div>
    </div>
  );
}

export function DonutChart({ segs, center }: { segs: { k: string; v: number; c: string; href?: string }[]; center?: string }) {
  const total = Math.max(1, segs.reduce((s, x) => s + x.v, 0));
  const C = 2 * Math.PI * 40;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        {segs.map((sg) => {
          const len = (sg.v / total) * C;
          const el = <circle key={sg.k} cx="50" cy="50" r="40" fill="none" stroke={sg.c} strokeWidth="8" strokeDasharray={`${Math.max(0, len - 1.2)} ${C - len + 1.2}`} strokeDashoffset={-acc} />;
          acc += len; return el;
        })}
        <text x="50" y="47" textAnchor="middle" transform="rotate(90 50 50)" fill={brand.ink} fontSize="15" fontWeight="600" letterSpacing="-0.5">{center ?? total}</text>
        <text x="50" y="59" textAnchor="middle" transform="rotate(90 50 50)" fill={brand.body} fontSize="5.5" letterSpacing="0.8">TOTAL</text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        {segs.map((sg) => {
          const row = (
            <span className="flex items-center gap-2 text-[color:var(--body)] transition hover:text-[color:var(--ink)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sg.c }} />
              <span className="truncate">{sg.k}</span>
              <span className="mo-mono ml-auto pl-4 text-[13px] text-[color:var(--ink)]">{sg.v}</span>
            </span>
          );
          return sg.href ? <Link key={sg.k} href={sg.href} className="block">{row}</Link> : <div key={sg.k}>{row}</div>;
        })}
      </div>
    </div>
  );
}

export function HBars({ rows }: { rows: { k: string; v: number; c?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.k} className="flex items-center gap-3 text-sm">
          <span className="w-28 truncate text-[color:var(--body)]">{r.k}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full" style={{ width: `${(r.v / max) * 100}%`, background: r.c ?? SERIES[i % SERIES.length] }} />
          </span>
          <span className="mo-mono w-12 text-right text-[13px] text-[color:var(--ink)]">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

/** Section card with mono eyebrow title and the signature hairline. */
export function BandCard({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mo-card aiv-glow p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{title}</h2>
        {sub && <span className="mo-eyebrow shrink-0">{sub}</span>}
      </div>
      {children}
    </div>
  );
}
