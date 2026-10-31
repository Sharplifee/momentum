import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";
import { Tile } from "@/components/crm/Charts";
import { PageHeader, LinkButton, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FREQ: Record<string, string> = { weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly", one_time: "One-off" };
const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" }, { key: "weekly", label: "Weekly" }, { key: "biweekly", label: "Biweekly" }, { key: "balance", label: "Balance due" }, { key: "paused", label: "Paused" },
];
const initials = (n: string | null) => (n ?? "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const monthYear = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Denver" });
const monthDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Accounts. Three counts, the plan chips, then every customer as a row: who,
 * where, how often, and on the right the one thing worth knowing — new,
 * owes money, had an exception, or simply how many visits they've had.
 */
export default async function Customers({ searchParams }: { searchParams: { q?: string; f?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const f = searchParams.f ?? "";
  let q = db.from("customers").select("id, full_name, first_name, last_name, phone, status, created_at").neq("status", "opted_out").order("full_name").limit(400);
  if (searchParams.q) q = q.or(`full_name.ilike.%${searchParams.q}%,phone.ilike.%${searchParams.q}%`);
  const { data: customers } = await q;
  const ids = (customers ?? []).map((c) => c.id);

  const [{ data: props }, { data: ags }, { data: jobs }, { data: open }] = await Promise.all([
    ids.length ? db.from("properties").select("customer_id, city").in("customer_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("service_agreements").select("customer_id, frequency, day_of_week, season_start, created_at").eq("active", true).in("customer_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("jobs").select("customer_id, status, scheduled_date").in("customer_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("invoices").select("customer_id, total").in("status", ["sent", "overdue"]).in("customer_id", ids) : Promise.resolve({ data: [] as any[] }),
  ]);
  const cityBy = new Map<string, string | null>();
  for (const p of props ?? []) if (!cityBy.has(p.customer_id)) cityBy.set(p.customer_id, p.city);
  const agBy = new Map<string, any>();
  for (const a of ags ?? []) if (!agBy.has(a.customer_id)) agBy.set(a.customer_id, a);
  const visits = new Map<string, number>(); const exception = new Set<string>(); const nextVisit = new Map<string, string>();
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  for (const j of jobs ?? []) {
    if (j.status === "completed") visits.set(j.customer_id, (visits.get(j.customer_id) ?? 0) + 1);
    if (j.status === "exception") exception.add(j.customer_id);
    if (j.status === "scheduled" && j.scheduled_date >= todayIso && (!nextVisit.has(j.customer_id) || j.scheduled_date < nextVisit.get(j.customer_id)!)) nextVisit.set(j.customer_id, j.scheduled_date);
  }
  const balance = new Map<string, number>();
  for (const i of open ?? []) balance.set(i.customer_id, (balance.get(i.customer_id) ?? 0) + Number(i.total));

  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const all = customers ?? [];
  const activeCount = all.filter((c) => c.status === "active").length;
  const newCount = all.filter((c) => c.created_at >= monthAgo).length;
  const pausedCount = all.filter((c) => c.status === "paused").length;

  const list = all.filter((c) => {
    if (f === "weekly" || f === "biweekly") return agBy.get(c.id)?.frequency === f;
    if (f === "balance") return (balance.get(c.id) ?? 0) > 0;
    if (f === "paused") return c.status === "paused";
    return true;
  });

  // Alphabetical buckets, labelled by the letters they actually span (A–H, L–P …).
  const sortKey = (c: any) => ((c.last_name ?? c.full_name ?? "").trim()[0] ?? "#").toUpperCase();
  const sorted = [...list].sort((a, b) => `${a.last_name ?? a.full_name} ${a.full_name}`.localeCompare(`${b.last_name ?? b.full_name} ${b.full_name}`));
  const buckets: { label: string; rows: typeof sorted }[] = [];
  const ranges = [["A", "H"], ["I", "P"], ["Q", "Z"]];
  for (const [lo, hi] of ranges) {
    const rows = sorted.filter((c) => { const k = sortKey(c); return k >= lo && k <= hi; });
    if (!rows.length) continue;
    const first = sortKey(rows[0]), last = sortKey(rows[rows.length - 1]);
    buckets.push({ label: first === last ? first : `${first}–${last}`, rows });
  }
  const other = sorted.filter((c) => !/[A-Z]/.test(sortKey(c)));
  if (other.length) buckets.push({ label: "#", rows: other });

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...over })) if (v) p.set(k, v);
    return `/crm/customers${p.toString() ? `?${p}` : ""}`;
  };

  const subFor = (c: any) => {
    const ag = agBy.get(c.id);
    const since = ag?.season_start ?? ag?.created_at ?? null;
    const starts = nextVisit.get(c.id);
    const firstVisit = (visits.get(c.id) ?? 0) === 0 && starts;
    return [cityBy.get(c.id), ag ? FREQ[ag.frequency] ?? ag.frequency : null, ag?.day_of_week != null ? DOW[ag.day_of_week] : null,
      firstVisit ? `starts ${monthDay(starts)}` : since ? `since ${monthYear(since)}` : `added ${monthYear(c.created_at)}`].filter(Boolean).join(" · ");
  };
  const rightFor = (c: any) => {
    if ((balance.get(c.id) ?? 0) > 0) return <span className="mo-eyebrow text-coral">Balance</span>;
    if (exception.has(c.id)) return <span className="mo-eyebrow text-gold">Exception</span>;
    if ((visits.get(c.id) ?? 0) === 0 && c.created_at >= monthAgo) return <span className="mo-eyebrow text-teal">New</span>;
    const v = visits.get(c.id) ?? 0;
    return <span className={`mo-mono text-[11px] ${v ? "text-[color:var(--body)]" : "text-[color:var(--faint)]"}`}>{v} visit{v === 1 ? "" : "s"}</span>;
  };

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Accounts" title="Customers" action={<LinkButton href="/crm/customers/new">+ New</LinkButton>} />

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Tile label="Active" value={activeCount} />
          <Tile label="New · 30d" value={<span className="text-teal">{newCount}</span>} />
          <Tile label="Paused" value={pausedCount} href={qs({ f: "paused" })} />
        </div>

        <div className="mb-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((o) => (
            <Link key={o.key} href={qs({ f: o.key || undefined })} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${f === o.key ? "border-transparent bg-[color:var(--ink)] text-[#0a0a0a]" : "border-[color:var(--border)] text-[color:var(--body)]"}`}>{o.label}</Link>
          ))}
        </div>

        <form className="mo-card mb-3 px-4 py-3">
          {f && <input type="hidden" name="f" value={f} />}
          <div className="flex items-center gap-2.5 text-[color:var(--faint)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search name or phone" className="w-full bg-transparent text-[15px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--faint)]" />
          </div>
        </form>

        {!buckets.length ? (
          <EmptyState title={searchParams.q || f ? "No customers match" : "No customers yet"}
            hint={searchParams.q || f ? "Nothing fits that filter right now." : "Won leads land here on their own. Handshake deals go in with + New."}
            action={<LinkButton href="/crm/customers/new">+ New customer</LinkButton>} />
        ) : (
          <div className="mo-card p-0">
            {buckets.map((b, bi) => (
              <div key={b.label} className={bi > 0 ? "border-t border-[color:var(--border)]" : ""}>
                <div className="mo-eyebrow px-4 pb-1.5 pt-3">{b.label}</div>
                {b.rows.map((c) => (
                  <Link key={c.id} href={`/crm/customers/${c.id}`} className="flex items-center gap-3 border-t border-[color:var(--border)] px-4 py-3 transition hover:bg-white/[0.03]">
                    <span className="mo-mono grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:var(--border)] text-[12px] text-[color:var(--ink)]">{initials(c.full_name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--ink)]">{c.full_name}</span>
                      <span className="block truncate text-[12px] text-[color:var(--body)]">{subFor(c)}</span>
                    </span>
                    <span className="shrink-0">{rightFor(c)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
