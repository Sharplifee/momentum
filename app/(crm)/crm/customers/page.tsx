import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";
import { DeltaTile } from "@/components/crm/Charts";

export const dynamic = "force-dynamic";

export default async function Customers({ searchParams }: { searchParams: { q?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  let q = db.from("customers").select("id, full_name, phone, status, lifetime_value, created_at").neq("status", "opted_out").order("full_name").limit(300);
  if (searchParams.q) q = q.ilike("full_name", `%${searchParams.q}%`);
  const { data: customers } = await q;
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const newMonth = (customers ?? []).filter((c) => c.created_at >= monthAgo).length;
  const ltv = (customers ?? []).reduce((s2, c) => s2 + Number(c.lifetime_value ?? 0), 0);

  const sections = new Map<string, typeof customers>();
  for (const c of customers ?? []) {
    const letter = (c.full_name?.[0] ?? "#").toUpperCase();
    if (!sections.has(letter)) sections.set(letter, [] as any);
    (sections.get(letter) as any).push(c);
  }

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Accounts</div>
        <h1 className="mb-4 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Customers</h1>
        <div className="mb-5 grid grid-cols-3 gap-3">
          <DeltaTile label="Total Clients" value={(customers ?? []).length} delta="active accounts" icon="◈" seed={5} />
          <DeltaTile label="New (30d)" value={newMonth} delta="growth" icon="◎" seed={9} />
          <DeltaTile label="Lifetime Value" value={`$${ltv.toFixed(0)}`} delta="all accounts" icon="▤" seed={13} />
        </div>
        <form className="mb-4">
          <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search"
            className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-white/[0.06] px-4 text-sm outline-none focus:border-teal dark:bg-white/10" />
        </form>
        {[...sections.entries()].map(([letter, list]) => (
          <div key={letter} className="mb-4">
            <div className="px-3 pb-1 text-xs font-semibold text-[color:var(--body)]/70">{letter}</div>
            <div className="mo-card divide-y divide-[color:var(--border)] p-0">
              {(list ?? []).map((c) => (
                <Link key={c.id} href={`/crm/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal/15 text-[13px] font-semibold text-teal">
                    {(c.full_name?.match(/\b\w/g) ?? ["?"]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[color:var(--ink)]">{c.full_name}</span>
                    <span className="block text-xs text-[color:var(--body)]">{c.phone}</span>
                  </span>
                  <span className="text-sm font-semibold text-[color:var(--ink)]">${Number(c.lifetime_value ?? 0).toFixed(0)}</span>
                  <span className="text-[color:var(--body)]/50">›</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {!customers?.length && (
          <div className="mo-card flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-[color:var(--body)]">No customers{searchParams.q ? " matched" : " yet"} — leads become customers when Nora closes them.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
