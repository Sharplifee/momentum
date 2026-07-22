import Link from "next/link";

/* ===== Momentum v6 chart kit — pure-SVG server components ===== */

export function DeltaTile({ label, value, delta, up = true, icon, href, seed = 1, points }: {
  label: string; value: string | number; delta?: string; up?: boolean; icon: string; href?: string; seed?: number; points?: number[];
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
  const body = (
    <div className="mo-card aiv-glow flex flex-col gap-2 p-4 transition hover:shadow-glow">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal/15 text-base text-teal ring-1 ring-teal/25">{icon}</span>
        <span className="text-[13px] font-medium text-slate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="font-display text-[30px] font-bold leading-none text-navy">{value}</span>
        {delta && <span className={`pb-1 text-[11px] font-semibold ${up ? "text-green" : "text-red"}`}>{delta}</span>}
      </div>
      <svg viewBox="0 0 100 50" className="h-9 w-full" preserveAspectRatio="none">
        <defs><linearGradient id={`dt${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7cf6" stopOpacity="0.35" /><stop offset="100%" stopColor="#8b7cf6" stopOpacity="0" /></linearGradient></defs>
        {hasData && <path d={`${d} L100,50 L0,50 Z`} fill={`url(#dt${seed})`} />}
        <path d={d} fill="none" stroke={hasData ? "#a99df8" : "rgba(148,155,200,0.35)"} strokeWidth={hasData ? 2 : 1.2} strokeLinecap="round" strokeDasharray={hasData ? undefined : "3 3"} />
      </svg>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function FunnelChart({ stages }: { stages: { k: string; v: number; c: string; href?: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.v));
  const W = 200, layerH = 34, gap = 3, minW = 10;
  const widths = stages.map((s) => Math.max(minW, (s.v / max) * (W - 12)));
  return (
    <div className="flex items-center gap-6">
      <svg viewBox={`0 0 ${W} ${stages.length * (layerH + gap)}`} className="h-40 w-48 shrink-0">
        {stages.map((s, i) => {
          const topW = widths[i];
          const botW = widths[i + 1] !== undefined ? Math.min(widths[i], Math.max(widths[i + 1], minW)) : Math.max(topW * 0.55, minW);
          const y = i * (layerH + gap);
          const x1 = (W - topW) / 2, x2 = (W - botW) / 2;
          return (
            <g key={s.k}>
              <path d={`M${x1},${y} L${x1 + topW},${y} L${x2 + botW},${y + layerH} L${x2},${y + layerH} Z`} fill={s.c} opacity={s.v === 0 ? 0.25 : 0.92} />
              {s.v > 0 && topW > 34 && <text x={W / 2} y={y + layerH / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0b0e17">{s.v}</text>}
            </g>
          );
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        {stages.map((s) => {
          const row = (
            <span className="flex items-center gap-2.5 text-[color:var(--body)] transition hover:text-[color:var(--ink)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.c }} />
              <span>{s.k}</span>
              <span className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.07]"><span className="block h-full rounded-full" style={{ width: `${(s.v / max) * 100}%`, background: s.c }} /></span>
              <span className="w-8 text-right font-semibold text-[color:var(--ink)]">{s.v}</span>
            </span>
          );
          return s.href ? <Link key={s.k} href={s.href} className="block">{row}</Link> : <div key={s.k}>{row}</div>;
        })}
      </div>
    </div>
  );
}

export function AreaChart({ points, height = 96, label }: { points: number[]; height?: number; label?: string }) {
  const max = Math.max(1, ...points);
  const peak = points.indexOf(max);
  const n = Math.max(1, points.length - 1);
  const xy = points.map((v, i) => [(i * 100) / n, 46 - (v / max) * 38] as const);
  const d = `M${xy.map(([x, y]) => `${x},${y}`).join(" L")}`;
  return (
    <div>
      <svg viewBox="0 0 100 50" style={{ height }} className="w-full" preserveAspectRatio="none">
        <defs><linearGradient id="areaK" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7cf6" stopOpacity="0.4" /><stop offset="100%" stopColor="#8b7cf6" stopOpacity="0" /></linearGradient></defs>
        {[10, 22, 34].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(148,155,200,0.10)" strokeWidth="0.4" />)}
        <path d={`${d} L100,50 L0,50 Z`} fill="url(#areaK)" />
        <path d={d} fill="none" stroke="#a99df8" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {max > 0 && (
          <g>
            <line x1={xy[peak][0]} x2={xy[peak][0]} y1={xy[peak][1]} y2={48} stroke="#8b7cf6" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
            <circle cx={xy[peak][0]} cy={xy[peak][1]} r="2.2" fill="#0b0e17" stroke="#a99df8" strokeWidth="1.2" />
            <g transform={`translate(${Math.min(88, Math.max(6, xy[peak][0] - 6))},${Math.max(4, xy[peak][1] - 11)})`}>
              <rect width="13" height="8" rx="2.5" fill="#8b7cf6" />
              <text x="6.5" y="5.7" textAnchor="middle" fontSize="5" fontWeight="700" fill="#fff">{max}</text>
            </g>
          </g>
        )}
      </svg>
      {label && <div className="mt-1 text-[11px] text-[color:var(--body)]/70">{label}</div>}
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
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(148,155,200,0.12)" strokeWidth="12" />
        {segs.map((sg) => {
          const len = (sg.v / total) * C;
          const el = <circle key={sg.k} cx="50" cy="50" r="40" fill="none" stroke={sg.c} strokeWidth="12" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />;
          acc += len; return el;
        })}
        <text x="50" y="46" textAnchor="middle" transform="rotate(90 50 50)" fill="#e9ecf8" fontSize="15" fontWeight="700">{center ?? total}</text>
        <text x="50" y="60" textAnchor="middle" transform="rotate(90 50 50)" fill="#98a1bd" fontSize="6">total</text>
      </svg>
      <div className="space-y-1.5 text-sm">
        {segs.map((sg) => {
          const row = (
            <span className="flex items-center gap-2 text-[color:var(--body)] transition hover:text-[color:var(--ink)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: sg.c }} />{sg.k}
              <span className="ml-auto pl-5 font-semibold text-[color:var(--ink)]">{sg.v}</span>
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
      {rows.map((r) => (
        <div key={r.k} className="flex items-center gap-3 text-sm">
          <span className="w-28 truncate text-[color:var(--body)]">{r.k}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
            <span className="block h-full rounded-full" style={{ width: `${(r.v / max) * 100}%`, background: r.c ?? "#8b7cf6" }} />
          </span>
          <span className="w-10 text-right font-semibold text-[color:var(--ink)]">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

export function BandCard({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mo-card aiv-glow p-5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">{title}</h2>
        {sub && <span className="text-[11px] text-[color:var(--body)]/70">{sub}</span>}
      </div>
      {children}
    </div>
  );
}
