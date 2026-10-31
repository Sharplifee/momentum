/**
 * Reporting periods for Money and P&L — Month / Quarter / YTD, always in
 * America/Denver and always "to date". Dates are YYYY-MM-DD; `end` is
 * exclusive so `gte(start).lt(end)` reads naturally against date columns, and
 * `startTs`/`endTs` bound timestamptz columns (payments.paid_at, created_at).
 */
export type Range = "month" | "quarter" | "ytd";
export type Period = {
  range: Range;
  start: string; end: string;           // [start, end) as dates
  startTs: string; endTs: string;       // the same bounds as ISO timestamps
  today: string;
  label: string;                        // "October · month to date"
  span: string;                         // "October 1–30"
  short: string;                        // "Oct"
  prev: { start: string; end: string; startTs: string; endTs: string; short: string };
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Denver wall-clock date → ISO timestamp for the start of that date (UTC-7/-6 aware). */
function denverStartTs(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: "America/Denver" }));
  const offsetMin = (probe.getTime() - local.getTime()) / 60_000; // minutes Denver is behind UTC
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + offsetMin * 60_000).toISOString();
}

export function parseRange(v: string | undefined): Range {
  return v === "quarter" || v === "ytd" ? v : "month";
}

export function periodFor(range: Range, todayIso?: string): Period {
  const today = todayIso ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const [y, m, d] = today.split("-").map(Number);
  const nextMonth = (yy: number, mm: number) => (mm === 12 ? iso(yy + 1, 1, 1) : iso(yy, mm + 1, 1));
  let start: string, end: string, label: string, span: string, short: string;
  let prev: { start: string; end: string; short: string };
  if (range === "month") {
    start = iso(y, m, 1); end = nextMonth(y, m);
    label = `${MONTHS[m - 1]} · month to date`; span = `${MONTHS[m - 1]} 1–${d}`; short = MONTHS[m - 1].slice(0, 3);
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    prev = { start: iso(py, pm, 1), end: iso(y, m, 1), short: MONTHS[pm - 1].slice(0, 3) };
  } else if (range === "quarter") {
    const q = Math.floor((m - 1) / 3); const qm = q * 3 + 1;
    start = iso(y, qm, 1); end = qm + 3 > 12 ? iso(y + 1, 1, 1) : iso(y, qm + 3, 1);
    label = `Q${q + 1} ${y} · quarter to date`; span = `${MONTHS[qm - 1].slice(0, 3)} 1 – ${MONTHS[m - 1].slice(0, 3)} ${d}`; short = `Q${q + 1}`;
    const pqm = qm === 1 ? 10 : qm - 3, pqy = qm === 1 ? y - 1 : y;
    prev = { start: iso(pqy, pqm, 1), end: start, short: `Q${qm === 1 ? 4 : q}` };
  } else {
    start = iso(y, 1, 1); end = iso(y + 1, 1, 1);
    label = `${y} · year to date`; span = `Jan 1 – ${MONTHS[m - 1].slice(0, 3)} ${d}`; short = String(y);
    prev = { start: iso(y - 1, 1, 1), end: start, short: String(y - 1) };
  }
  return {
    range, start, end, today, label, span, short,
    startTs: denverStartTs(start), endTs: denverStartTs(end),
    prev: { ...prev, startTs: denverStartTs(prev.start), endTs: denverStartTs(prev.end) },
  };
}

/** The last `n` calendar months ending this month, oldest first: [{ key: "2026-04", short: "Apr", start, end }]. */
export function lastMonths(n: number, todayIso?: string) {
  const today = todayIso ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const [y, m] = today.split("-").map(Number);
  const out: { key: string; short: string; start: string; end: string; startTs: string; endTs: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let mm = m - i, yy = y;
    while (mm <= 0) { mm += 12; yy -= 1; }
    const start = iso(yy, mm, 1);
    const end = mm === 12 ? iso(yy + 1, 1, 1) : iso(yy, mm + 1, 1);
    out.push({ key: `${yy}-${pad(mm)}`, short: MONTHS[mm - 1].slice(0, 3), start, end, startTs: denverStartTs(start), endTs: denverStartTs(end) });
  }
  return out;
}

export const money = (n: number, cents = false) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
