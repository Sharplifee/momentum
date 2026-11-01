import Link from "next/link";

export type BoardDay = { iso: string; dow: string; num: number };
export type BoardJob = { id: string; scheduled_date: string; customer: string };

/** A customer's short handle for a 60-px chip: first name, or the whole thing when it's one word. */
export const chipName = (full: string) => (full ?? "").trim().split(/\s+/)[0] || "—";

/**
 * The Schedule page's five-day board. Five columns, not seven: on a phone each
 * column is ~60 px wide, which fits a first name but not a full one, so the
 * chips carry first names and the full name sits in the tooltip.
 */
export function WeekBoard({ week, service, quotes, todayIso }: { week: BoardDay[]; service: BoardJob[]; quotes: BoardJob[]; todayIso: string }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {week.map((d) => {
        const svc = service.filter((j) => j.scheduled_date === d.iso);
        const qts = quotes.filter((j) => j.scheduled_date === d.iso);
        const isToday = d.iso === todayIso;
        const total = svc.length + qts.length;
        return (
          <Link key={d.iso} href={`/crm/schedule?m=${d.iso.slice(0, 7)}&d=${d.iso}`}
            className={`min-w-0 min-h-[150px] overflow-hidden rounded-lg border p-1.5 transition hover:border-white/25 sm:min-h-[170px] sm:p-2 ${isToday ? "border-white/25 bg-white/[0.04]" : "border-[color:var(--border)]"}`}>
            <div className="mb-1.5 text-center">
              <div className="mo-eyebrow text-[8.5px]">{d.dow}</div>
              <div className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-[15px] font-bold ${isToday ? "bg-[color:var(--ink)] text-[#0a0a0a]" : "text-[color:var(--ink)]"}`}>{d.num}</div>
            </div>
            <div className="space-y-1">
              {svc.slice(0, 3).map((j) => (
                <div key={j.id} title={j.customer} className="truncate rounded border border-teal/40 px-1 py-1 text-center text-[10px] font-medium leading-tight text-teal">{chipName(j.customer)}</div>
              ))}
              {qts.slice(0, 3).map((j) => (
                <div key={j.id} title={j.customer} className="truncate rounded border border-gold/40 px-1 py-1 text-center text-[10px] font-medium leading-tight text-gold">{chipName(j.customer)}</div>
              ))}
              {total === 0 && <div className="pt-2 text-center text-[10px] text-[color:var(--body)]/40">—</div>}
              {total > 6 && <div className="truncate text-center text-[10px] text-[color:var(--body)]/60">+{total - 6} more</div>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
